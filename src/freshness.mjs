// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { discover } from './discover.mjs';
import { checkGraph, projectCheckOptions, safeProjectPath } from './subconscious-lib.mjs';

export const FRESHNESS_SCHEMA_VERSION = 1;
export const DEFAULT_SOURCE_EXTENSIONS = Object.freeze([
  '.c', '.cc', '.cpp', '.cs', '.css', '.go', '.h', '.hpp', '.html', '.java',
  '.js', '.jsx', '.json', '.kt', '.mjs', '.cjs', '.php', '.prisma', '.proto',
  '.py', '.rb', '.rs', '.sh', '.sql', '.svelte', '.swift', '.ts', '.tsx',
  '.vue',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeRelative(root, value) {
  return path.relative(root, value).replace(/\\/g, '/');
}

function pathOptions(project) {
  return { forbiddenPathSegments: project.config.forbidden_path_segments || [] };
}

export function projectFreshnessPath(project) {
  const configured = project.config.freshness;
  if (configured) {
    const resolved = safeProjectPath(project.root, configured, pathOptions(project));
    if (!resolved) throw new Error('Configured freshness path is outside the project boundary');
    return resolved;
  }
  return path.join(path.dirname(project.configPath), 'freshness.json');
}

function historyDirectory(project) {
  return path.join(path.dirname(projectFreshnessPath(project)), 'freshness-history');
}

function reconciliationLockPath(project) {
  return path.join(path.dirname(projectFreshnessPath(project)), 'freshness-reconciliation.lock');
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.new`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function fileFingerprint(project, relative) {
  const full = safeProjectPath(project.root, relative, pathOptions(project));
  if (!full) return { status: 'unknown', path: relative, reason: 'outside project boundary or forbidden' };
  let before;
  try {
    before = fs.statSync(full);
  } catch (error) {
    return { status: error.code === 'ENOENT' ? 'missing' : 'unknown', path: relative, reason: error.code || error.message };
  }
  if (!before.isFile()) return { status: 'unknown', path: relative, reason: 'not a regular file' };
  let content;
  try {
    content = fs.readFileSync(full);
  } catch (error) {
    return { status: 'unknown', path: relative, reason: error.code || error.message };
  }
  const after = fs.statSync(full);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    return { status: 'unknown', path: relative, reason: 'changed during verification' };
  }
  return { status: 'current', path: relative, sha256: sha256(content), size: content.length };
}

function graphEvidencePaths(project) {
  const values = new Set([
    normalizeRelative(project.root, project.configPath),
    normalizeRelative(project.root, project.graphPath),
    ...(project.config.memory_files || []),
  ]);
  for (const node of project.graph.nodes || []) {
    if (node.path) values.add(node.path);
    for (const value of node.maps || []) values.add(value);
    for (const value of node.evidence || []) values.add(value);
    for (const gap of node.gaps || []) if (gap.evidence) values.add(gap.evidence);
  }
  for (const edge of project.graph.edges || []) {
    for (const evidence of edge.evidence || []) if (evidence.path) values.add(evidence.path);
  }
  return [...values].map(value => value.replace(/\\/g, '/')).sort();
}

function sourceExtensions(project) {
  const configured = project.config.freshness_rules?.source_extensions;
  const values = configured?.length ? configured : DEFAULT_SOURCE_EXTENSIONS;
  return new Set(values.map(value => value.startsWith('.') ? value.toLowerCase() : `.${value.toLowerCase()}`));
}

function minimizeRoots(roots) {
  const sorted = [...new Set(roots)].sort((a, b) => a.length - b.length || a.localeCompare(b));
  return sorted.filter((candidate, index) => !sorted.slice(0, index).some(root => root === '' || candidate === root || candidate.startsWith(`${root}/`)));
}

function sourceRoots(project) {
  const configured = project.config.freshness_rules?.source_roots;
  if (configured?.length) return minimizeRoots(configured.map(value => value.replace(/\\/g, '/').replace(/\/$/, '')));
  const roots = (project.graph.nodes || [])
    .filter(node => ['module', 'route', 'provider', 'test'].includes(node.type) && node.path)
    .map(node => path.posix.dirname(node.path.replace(/\\/g, '/')))
    .map(value => value === '.' ? '' : value);
  return minimizeRoots(roots);
}

function scanSourceRoot(project, relativeRoot, extensions, files, unresolved) {
  const rootValue = relativeRoot || '.';
  const fullRoot = relativeRoot ? safeProjectPath(project.root, relativeRoot, pathOptions(project)) : project.root;
  if (!fullRoot || !fs.existsSync(fullRoot)) {
    unresolved.push({ path: rootValue, reason: 'source root missing or unavailable' });
    return;
  }
  const stateDirectory = path.resolve(path.dirname(project.configPath));
  const forbidden = new Set((project.config.forbidden_path_segments || []).map(value => String(value).toLowerCase()));
  const visit = directory => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      unresolved.push({ path: normalizeRelative(project.root, directory), reason: error.code || error.message });
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      const relative = normalizeRelative(project.root, full);
      if (path.resolve(full) === stateDirectory || path.resolve(full).startsWith(`${stateDirectory}${path.sep}`)) continue;
      const normalizedName = entry.name.toLowerCase();
      const withoutExtension = normalizedName.replace(/\.[^.]+$/, '');
      if (forbidden.has(normalizedName) || forbidden.has(withoutExtension)) continue;
      if (entry.isSymbolicLink()) {
        unresolved.push({ path: relative, reason: 'symbolic link not followed' });
      } else if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(relative);
      }
    }
  };
  visit(fullRoot);
}

function inventoryPaths(project, roots = sourceRoots(project)) {
  const files = [], unresolved = [];
  const extensions = sourceExtensions(project);
  for (const root of roots) scanSourceRoot(project, root, extensions, files, unresolved);
  return {
    roots,
    extensions: [...extensions].sort(),
    files: [...new Set(files)].sort(),
    unresolved,
  };
}

function fingerprintPaths(project, paths) {
  const files = {}, unresolved = [];
  for (const relative of [...new Set(paths)].sort()) {
    const fingerprint = fileFingerprint(project, relative);
    if (fingerprint.status === 'current') files[relative] = { sha256: fingerprint.sha256, size: fingerprint.size };
    else unresolved.push(fingerprint);
  }
  return { files, unresolved };
}

function modulePaths(project) {
  return (project.graph.nodes || [])
    .filter(node => node.type === 'module' && node.path && node.discovery !== false)
    .map(node => node.path.replace(/\\/g, '/'))
    .sort();
}

function stableSnapshot(snapshot) {
  return JSON.stringify({
    algorithm: snapshot.algorithm,
    graph_sha256: snapshot.graph_sha256,
    evidence: snapshot.evidence,
    source_inventory: snapshot.source_inventory,
    discovery: snapshot.discovery,
  });
}

export function buildFreshnessSnapshot(project) {
  const evidence = fingerprintPaths(project, graphEvidencePaths(project));
  const inventory = inventoryPaths(project);
  const inventoryFingerprints = fingerprintPaths(project, inventory.files);
  const lexical = discover(modulePaths(project), {
    root: project.root,
    forbiddenPathSegments: project.config.forbidden_path_segments || [],
  });
  const graphRelative = normalizeRelative(project.root, project.graphPath);
  return {
    schema_version: FRESHNESS_SCHEMA_VERSION,
    algorithm: 'sha256',
    graph_sha256: evidence.files[graphRelative]?.sha256 || null,
    evidence: evidence.files,
    source_inventory: {
      roots: inventory.roots,
      extensions: inventory.extensions,
      files: inventoryFingerprints.files,
    },
    discovery: {
      method: lexical.method,
      imports: lexical.imports,
      api_strings: lexical.apiStrings,
      unresolved: lexical.unresolved,
    },
    unresolved: [...evidence.unresolved, ...inventory.unresolved, ...inventoryFingerprints.unresolved],
  };
}

export function readFreshnessBaseline(project) {
  const file = projectFreshnessPath(project);
  if (!fs.existsSync(file)) return null;
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (baseline.schema_version !== FRESHNESS_SCHEMA_VERSION || baseline.algorithm !== 'sha256') {
    throw new Error('Unsupported freshness baseline; reconcile with a compatible Durable Subconscious version');
  }
  return baseline;
}

function compareFiles(baseline = {}, current = {}) {
  const changed = [], missing = [], added = [];
  for (const [relative, expected] of Object.entries(baseline)) {
    const actual = current[relative];
    if (!actual) missing.push(relative);
    else if (actual.sha256 !== expected.sha256 || actual.size !== expected.size) changed.push(relative);
  }
  for (const relative of Object.keys(current)) if (!baseline[relative]) added.push(relative);
  return { changed: changed.sort(), missing: missing.sort(), added: added.sort() };
}

function relevantPathsForImpact(project, result) {
  const nodeIds = new Set([...(result.targets || []), ...(result.reached || []).map(node => node.id)]);
  for (const edge of result.direct || []) {
    nodeIds.add(edge.from);
    nodeIds.add(edge.to);
  }
  const paths = new Set([normalizeRelative(project.root, project.graphPath)]);
  const moduleFiles = [];
  for (const node of project.graph.nodes || []) {
    if (!nodeIds.has(node.id)) continue;
    if (node.path) paths.add(node.path.replace(/\\/g, '/'));
    if (node.type === 'module' && node.path && node.discovery !== false) moduleFiles.push(node.path.replace(/\\/g, '/'));
    for (const value of node.maps || []) paths.add(value.replace(/\\/g, '/'));
    for (const value of node.evidence || []) paths.add(value.replace(/\\/g, '/'));
    for (const gap of node.gaps || []) if (gap.evidence) paths.add(gap.evidence.replace(/\\/g, '/'));
  }
  for (const edge of project.graph.edges || []) {
    if (!nodeIds.has(edge.from) && !nodeIds.has(edge.to)) continue;
    for (const evidence of edge.evidence || []) if (evidence.path) paths.add(evidence.path.replace(/\\/g, '/'));
  }
  return { paths: [...paths].sort(), moduleFiles: [...new Set(moduleFiles)].sort() };
}

function dependencyUncertainty(project, files) {
  const lexical = discover(files, { root: project.root, forbiddenPathSegments: project.config.forbidden_path_segments || [] });
  const nodesByPath = new Map((project.graph.nodes || []).filter(node => node.path).map(node => [node.path.replace(/\\/g, '/'), node]));
  const unresolved = [...lexical.unresolved];
  for (const item of lexical.imports) {
    const from = nodesByPath.get(item.file);
    const to = nodesByPath.get(item.target);
    if (!from || !to) {
      unresolved.push({ ...item, reason: 'literal dependency is not fully mapped' });
      continue;
    }
    // A literal import proves a code dependency, but not which graph edge type or
    // semantic direction represents it. Mapping both endpoints is sufficient for
    // freshness; graph semantics remain an evidence-review responsibility.
  }
  return { lexical, unresolved };
}

function finalizeVerification({ baseline, evidence, inventory, unresolved, relevantInventory = null }) {
  if (!baseline) {
    const reasons = unresolved?.length
      ? unresolved.map(item => typeof item === 'string' ? item : `${item.path || item.file || 'evidence'}: ${item.reason}`)
      : ['No reconciled freshness baseline exists'];
    return {
      status: 'unknown',
      baseline: 'missing',
      stale: [],
      unknown: reasons,
      inventory,
      relevant_inventory: relevantInventory,
      disclaimer: 'Unchanged fingerprints show only that evidence has not changed since reconciliation; they do not prove semantic completeness.',
    };
  }
  const stale = [...new Set([...evidence.changed, ...evidence.missing])].sort();
  const unknown = unresolved.map(item => typeof item === 'string' ? item : `${item.path || item.file || 'evidence'}: ${item.reason}`);
  const status = stale.length ? 'stale' : unknown.length ? 'unknown' : 'current';
  return {
    status,
    baseline: baseline.reconciled_at || 'present',
    stale,
    unknown: [...new Set(unknown)].sort(),
    inventory,
    relevant_inventory: relevantInventory,
    disclaimer: 'Current means unchanged since successful reconciliation; it is not proof of semantic completeness.',
  };
}

export function verifyProjectFreshness(project, { afterFirstPass } = {}) {
  if (fs.existsSync(reconciliationLockPath(project))) {
    return finalizeVerification({ baseline: null, evidence: { changed: [], missing: [], added: [] }, inventory: null, unresolved: ['Reconciliation is in progress'] });
  }
  const baseline = readFreshnessBaseline(project);
  if (!baseline) return finalizeVerification({ baseline, evidence: { changed: [], missing: [], added: [] }, inventory: null, unresolved: [] });
  const first = buildFreshnessSnapshot(project);
  if (afterFirstPass) afterFirstPass();
  const second = buildFreshnessSnapshot(project);
  const changedDuring = stableSnapshot(first) === stableSnapshot(second) ? [] : [{ path: 'project', reason: 'changed during verification' }];
  const evidence = compareFiles(baseline.evidence, second.evidence);
  const inventory = compareFiles(baseline.source_inventory?.files, second.source_inventory.files);
  const graphChanged = baseline.graph_sha256 !== second.graph_sha256 ? [normalizeRelative(project.root, project.graphPath)] : [];
  evidence.changed.push(...graphChanged);
  const unresolved = [...second.unresolved, ...changedDuring];
  if (second.discovery.unresolved.length) unresolved.push(...second.discovery.unresolved);
  if (inventory.changed.length || inventory.missing.length || inventory.added.length) {
    evidence.changed.push(...inventory.changed, ...inventory.missing, ...inventory.added);
  }
  return finalizeVerification({ baseline, evidence, inventory, unresolved });
}

export function verifyImpactFreshness(project, result, { afterFirstPass } = {}) {
  if (fs.existsSync(reconciliationLockPath(project))) {
    return finalizeVerification({ baseline: null, evidence: { changed: [], missing: [], added: [] }, inventory: null, unresolved: ['Reconciliation is in progress'] });
  }
  const baseline = readFreshnessBaseline(project);
  if (!baseline) return finalizeVerification({ baseline, evidence: { changed: [], missing: [], added: [] }, inventory: null, unresolved: [] });
  const relevant = relevantPathsForImpact(project, result);
  const first = fingerprintPaths(project, relevant.paths);
  if (afterFirstPass) afterFirstPass();
  const second = fingerprintPaths(project, relevant.paths);
  const evidence = compareFiles(
    Object.fromEntries(relevant.paths.filter(value => baseline.evidence[value]).map(value => [value, baseline.evidence[value]])),
    second.files,
  );
  for (const relative of relevant.paths) if (!baseline.evidence[relative]) evidence.added.push(relative);
  const changedDuring = JSON.stringify(first.files) === JSON.stringify(second.files) ? [] : [{ path: 'project', reason: 'changed during verification' }];
  const dependency = dependencyUncertainty(project, relevant.moduleFiles);
  const currentInventory = inventoryPaths(project, sourceRoots(project));
  const inventory = compareFiles(
    baseline.source_inventory?.files || {},
    Object.fromEntries(currentInventory.files.map(relative => [relative, baseline.source_inventory?.files?.[relative] || { sha256: null, size: null }])),
  );
  const imported = new Set(dependency.lexical.imports.map(item => item.target));
  const relevantInventory = {
    added: inventory.added.filter(relative => imported.has(relative)),
    missing: inventory.missing.filter(relative => relevant.paths.includes(relative) || imported.has(relative)),
    changed: [],
    observed_unrelated_additions: inventory.added.filter(relative => !imported.has(relative)),
  };
  evidence.changed.push(...relevantInventory.added, ...relevantInventory.missing);
  const unresolved = [...second.unresolved, ...changedDuring, ...dependency.unresolved, ...currentInventory.unresolved];
  return finalizeVerification({ baseline, evidence, inventory, unresolved, relevantInventory });
}

function archiveBaseline(project, baseline) {
  const directory = historyDirectory(project);
  fs.mkdirSync(directory, { recursive: true });
  const stamp = String(baseline.reconciled_at || 'unknown').replace(/[:.]/g, '-');
  const digest = sha256(JSON.stringify(baseline)).slice(0, 12);
  const target = path.join(directory, `${stamp}-${digest}.json`);
  if (!fs.existsSync(target)) fs.writeFileSync(target, `${JSON.stringify(baseline, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

export function reconcileProject(project, { acceptCurrentEvidence = false, afterFirstSnapshot, afterSecondSnapshot } = {}) {
  if (!acceptCurrentEvidence) throw new Error('Reconciliation requires --accept-current-evidence after source and knowledge review');
  const structural = checkGraph(project.graph, projectCheckOptions(project));
  if (structural.errors.length) throw new Error(`Structural validation failed with ${structural.errors.length} error(s); freshness baseline not updated`);
  const lock = reconciliationLockPath(project);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  let lockHandle;
  try {
    lockHandle = fs.openSync(lock, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another reconciliation is already in progress');
    throw error;
  }
  try {
    const first = buildFreshnessSnapshot(project);
    if (afterFirstSnapshot) afterFirstSnapshot();
    const second = buildFreshnessSnapshot(project);
    if (first.unresolved.length || second.unresolved.length) throw new Error('Evidence unavailable or unstable; freshness baseline not updated');
    if (stableSnapshot(first) !== stableSnapshot(second)) throw new Error('Project changed during reconciliation; freshness baseline not updated');
    const previous = readFreshnessBaseline(project);
    if (previous && stableSnapshot(previous) === stableSnapshot(second)) {
      return { status: 'unchanged', path: projectFreshnessPath(project), summary: freshnessSummary(second), gaps: structural.gaps.length };
    }
    if (afterSecondSnapshot) afterSecondSnapshot();
    const third = buildFreshnessSnapshot(project);
    if (third.unresolved.length || stableSnapshot(second) !== stableSnapshot(third)) {
      throw new Error('Project changed during reconciliation; freshness baseline not updated');
    }
    if (previous) archiveBaseline(project, previous);
    const next = { ...third, reconciled_at: new Date().toISOString() };
    atomicWrite(projectFreshnessPath(project), `${JSON.stringify(next, null, 2)}\n`);
    const finalSnapshot = buildFreshnessSnapshot(project);
    if (finalSnapshot.unresolved.length || stableSnapshot(third) !== stableSnapshot(finalSnapshot)) {
      if (previous) atomicWrite(projectFreshnessPath(project), `${JSON.stringify(previous, null, 2)}\n`);
      else fs.unlinkSync(projectFreshnessPath(project));
      throw new Error('Project changed before reconciliation completed; previous freshness baseline restored');
    }
    return { status: previous ? 'updated' : 'created', path: projectFreshnessPath(project), summary: freshnessSummary(next), gaps: structural.gaps.length };
  } finally {
    if (lockHandle !== undefined) fs.closeSync(lockHandle);
    try { fs.unlinkSync(lock); } catch {}
  }
}

export function freshnessSummary(snapshot) {
  return {
    evidence_files: Object.keys(snapshot.evidence || {}).length,
    source_files: Object.keys(snapshot.source_inventory?.files || {}).length,
    literal_imports: snapshot.discovery?.imports?.length || 0,
    unresolved_dependencies: snapshot.discovery?.unresolved?.length || 0,
  };
}

export function applyFreshnessToImpact(result, verification) {
  const stalePaths = new Set(verification.stale || []);
  const statusFor = edge => {
    if (verification.status === 'unknown') return 'unknown';
    const evidencePaths = (edge.evidence || []).map(item => item.path?.replace(/\\/g, '/')).filter(Boolean);
    if (evidencePaths.some(value => stalePaths.has(value))) return 'stale';
    if (verification.status === 'stale') return 'unknown';
    return 'current';
  };
  const direct = (result.direct || []).map(edge => ({ ...edge, freshness_status: statusFor(edge) }));
  return {
    ...result,
    verified_current: verification.status === 'current',
    direct,
    verified_direct: direct.filter(edge => edge.freshness_status === 'current'),
    unverified_direct: direct.filter(edge => edge.freshness_status !== 'current'),
    freshness: verification,
  };
}

export function formatFreshness(verification) {
  const lines = [
    `status: ${verification.status}`,
    `baseline: ${verification.baseline}`,
    verification.disclaimer,
  ];
  if (verification.stale?.length) lines.push(`stale evidence: ${verification.stale.join(', ')}`);
  if (verification.unknown?.length) lines.push(`unknown evidence: ${verification.unknown.join('; ')}`);
  return lines.join('\n');
}
