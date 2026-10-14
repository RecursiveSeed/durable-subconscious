// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_STATE_DIRECTORY = '.durable-subconscious';
export const DEFAULT_CONFIG_PATH = `${DEFAULT_STATE_DIRECTORY}/config.json`;
export const EDGE_TYPES = new Set('OWNS READS WRITES PROJECTS TRANSFORMS PERSISTS HYDRATES CACHES INVALIDATES SCHEDULES CONSUMES FALLS_BACK_TO RECOVERS_WITH MUST_NOT_ACCESS MUST_NOT_CHANGE DISPLAYED_BY IMPLEMENTS_CAPABILITY PROTECTED_BY_TEST'.split(' '));
export const SOURCES = new Set('CODE_DISCOVERED CANONICAL_CONTRACT HUMAN_APPROVED AUDIT_DISCOVERED INFERRED_PENDING_REVIEW'.split(' '));
export const NODE_TYPES = new Set('system module authority state storage cache worker route provider surface capability test journey privacy issue'.split(' '));

function normalizeForbiddenSegment(value) {
  return String(value).trim().toLowerCase();
}

export function safeProjectPath(root, value, { forbiddenPathSegments = [] } = {}) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || /^[a-z]:/i.test(value)) return null;
  const forbidden = new Set(forbiddenPathSegments.map(normalizeForbiddenSegment).filter(Boolean));
  const blocked = value.split(/[\\/]/).some(part => {
    const normalized = part.toLowerCase();
    const withoutExtension = normalized.replace(/\.[^.]+$/, '');
    return forbidden.has(normalized) || forbidden.has(withoutExtension);
  });
  if (blocked) return null;
  const projectRoot = path.resolve(root);
  const full = path.resolve(projectRoot, value);
  return full.startsWith(projectRoot + path.sep) ? full : null;
}

function configuredPath(root, value, options = {}) {
  const relative = path.isAbsolute(value) ? path.relative(root, value) : value;
  return safeProjectPath(root, relative, options);
}

export function loadGraph(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadProject({ root = process.cwd(), configPath = DEFAULT_CONFIG_PATH } = {}) {
  const projectRoot = path.resolve(root);
  const fullConfigPath = configuredPath(projectRoot, configPath);
  if (!fullConfigPath) throw new Error('Configuration must be inside the project root');
  const config = JSON.parse(fs.readFileSync(fullConfigPath, 'utf8'));
  if (config.schema_version !== 1) throw new Error('Expected configuration schema 1');
  if (typeof config.graph !== 'string') throw new Error('Configuration must name a graph file');
  const pathOptions = { forbiddenPathSegments: config.forbidden_path_segments || [] };
  const graphPath = configuredPath(projectRoot, config.graph, pathOptions);
  if (!graphPath) throw new Error('Configured graph path is outside the project boundary');
  return { root: projectRoot, configPath: fullConfigPath, config, graphPath, graph: loadGraph(graphPath) };
}

export function writeGraphAtomic(graph, file, { root = path.dirname(file) } = {}) {
  const projectRoot = path.resolve(root);
  const target = path.resolve(file);
  if (!(target.startsWith(projectRoot + path.sep))) throw new Error('Graph target must be inside the project root');
  const temporary = `${target}.${process.pid}.new`;
  fs.writeFileSync(temporary, JSON.stringify(graph, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

export function checkGraph(graph, {
  root = process.cwd(),
  exists = file => fs.existsSync(file),
  forbiddenPathSegments = [],
  expectedCapabilityCount = null,
  requiredCapabilityIds = [],
  capabilityCoverageRequired = true,
} = {}) {
  const errors = [], gaps = [];
  const fail = (code, id, detail) => errors.push({ code, id, detail });
  const nodes = new Map();
  if (graph.schema_version !== 1) fail('SCHEMA', 'graph', 'Expected graph schema 1');
  for (const n of graph.nodes || []) {
    if (!n.id || nodes.has(n.id)) fail('DUPLICATE_NODE', n.id, 'Missing/duplicate node ID');
    if (!NODE_TYPES.has(n.type)) fail('NODE_TYPE', n.id, n.type);
    nodes.set(n.id, n);
  }
  const ref = (value, id, field) => { if (!nodes.has(value)) fail('DANGLING_NODE', id, `${field}: ${value}`); };
  const file = (value, id) => {
    const full = safeProjectPath(root, value, { forbiddenPathSegments });
    if (!full || !exists(full)) fail('DANGLING_FILE', id, value);
  };
  const missing = (n, code, detail) => {
    const acknowledged = n.gaps?.find(g => g.code === code && g.reason && g.evidence);
    if (acknowledged) {
      file(acknowledged.evidence, n.id);
      gaps.push({ code, id: n.id, detail, reason: acknowledged.reason });
    } else fail(code, n.id, detail);
  };
  const edgeIds = new Set();
  for (const e of graph.edges || []) {
    if (!e.id || edgeIds.has(e.id)) fail('DUPLICATE_EDGE', e.id, 'Missing/duplicate edge ID');
    edgeIds.add(e.id);
    ref(e.from, e.id, 'from'); ref(e.to, e.id, 'to');
    if (!EDGE_TYPES.has(e.type)) fail('EDGE_TYPE', e.id, e.type);
    if (!SOURCES.has(e.source)) fail('PROVENANCE', e.id, e.source);
    if (!['forward', 'reverse', 'both', 'none'].includes(e.impact)) fail('IMPACT_DIRECTION', e.id, e.impact);
    if (!e.evidence?.length) fail('EVIDENCE_MISSING', e.id, e.type);
    for (const ev of e.evidence || []) file(ev.path, e.id);
  }
  const links = (id, type) => (graph.edges || []).filter(e => e.from === id && e.type === type);
  for (const n of nodes.values()) {
    if (n.aliases !== undefined && (!Array.isArray(n.aliases) || n.aliases.some(value => typeof value !== 'string' || !value.trim()))) {
      fail('ALIASES', n.id, 'Aliases must be a list of non-empty strings');
    }
    if (n.path) file(n.path, n.id);
    for (const p of n.maps || []) file(p, n.id);
    for (const p of n.evidence || []) file(p, n.id);
    for (const key of ['owner', 'hydration_owner', 'invalidation_owner', 'stale_owner', 'recovery_owner', 'privacy_boundary']) {
      if (n[key]) ref(n[key], n.id, key);
    }
    if (n.type === 'system' && !n.owner) fail('SYSTEM_OWNER_MISSING', n.id, 'One owner required');
    if (n.persistent && !n.hydration_owner) missing(n, 'HYDRATION_MISSING', 'Persistent state needs hydration ownership');
    if (n.type === 'cache' && (!n.invalidation_owner || !n.invalidation_rule)) missing(n, 'INVALIDATION_MISSING', 'Cache invalidation owner/rule required');
    if (n.type === 'worker' && (!n.stale_owner || !n.stale_rule || !n.recovery_owner || !n.recovery_rule)) missing(n, 'JOB_SAFETY_MISSING', 'Worker stale/recovery owner and rules required');
    if (n.private && !n.privacy_boundary) missing(n, 'PRIVACY_MISSING', 'Private resource needs boundary');
    if (n.type === 'provider' && !(graph.edges || []).some(e => e.to === n.id && e.type === 'CONSUMES')) missing(n, 'CONSUMER_MISSING', 'Provider operation needs an output consumer');
    if (n.type === 'capability') {
      const implementation = (graph.edges || []).filter(e => e.to === n.id && e.type === 'IMPLEMENTS_CAPABILITY' && e.source !== 'INFERRED_PENDING_REVIEW' && nodes.get(e.from)?.implemented !== false);
      if (n.accepted && !implementation.length) missing(n, 'IMPLEMENTATION_MISSING', 'Accepted contract is not implemented merely because a node exists');
      const protection = links(n.id, 'PROTECTED_BY_TEST').filter(e => nodes.get(e.to)?.type === 'test' && nodes.get(e.to)?.implemented === true);
      if (n.accepted && !protection.length) missing(n, 'REGRESSION_MISSING', 'Planned journeys are not executable regression protection');
      if (capabilityCoverageRequired && (!n.coverage?.human_task || !n.coverage?.golden?.length)) fail('COVERAGE_MISSING', n.id, 'Human task and required journey mapping required');
      for (const id of n.coverage?.golden || []) ref(id, n.id, 'golden');
    }
    for (const g of n.gaps || []) {
      if (!g.code || !g.reason || !g.evidence) fail('GAP_RECORD', n.id, 'Gaps need typed reason/evidence');
      else {
        file(g.evidence, n.id);
        if (!gaps.some(item => item.id === n.id && item.code === g.code)) {
          gaps.push({ code: g.code, id: n.id, detail: 'Explicit unresolved coverage requirement', reason: g.reason });
        }
      }
    }
  }
  const caps = [...nodes.values()].filter(n => n.type === 'capability');
  if (Number.isInteger(expectedCapabilityCount) && caps.length !== expectedCapabilityCount) {
    fail('CAPABILITY_COUNT', 'graph', `Expected ${expectedCapabilityCount}, got ${caps.length}`);
  }
  for (const id of requiredCapabilityIds) if (!nodes.has(id)) fail('CAPABILITY_ID', id, 'Missing configured capability');
  return { errors, gaps, summary: { nodes: nodes.size, edges: edgeIds.size, capabilities: caps.length, errors: errors.length, acknowledged_gaps: gaps.length } };
}

export function projectCheckOptions(project) {
  const rules = project.config.graph_rules || {};
  return {
    root: project.root,
    forbiddenPathSegments: project.config.forbidden_path_segments || [],
    expectedCapabilityCount: rules.expected_capability_count ?? null,
    requiredCapabilityIds: rules.required_capability_ids || [],
    capabilityCoverageRequired: rules.capability_coverage_required !== false,
  };
}

export function impact(graph, inputs, { maxDepth = 8, root = process.cwd(), memoryFiles = [], projectName = 'project' } = {}) {
  const nodes = new Map((graph.nodes || []).map(n => [n.id, n]));
  const targets = new Set(), unknown = [];
  for (const input of inputs) {
    const normalized = input.replace(/\\/g, '/').replace(/^\.\//, '');
    const absolute = path.resolve(root, input).replace(/\\/g, '/');
    const found = (graph.nodes || []).filter(n => n.id === input || n.path === normalized || (n.path && path.resolve(root, n.path).replace(/\\/g, '/') === absolute));
    if (!found.length) unknown.push(input);
    found.forEach(n => targets.add(n.id));
  }
  const adjacency = new Map();
  const add = (a, b, e) => { if (!adjacency.has(a)) adjacency.set(a, []); adjacency.get(a).push({ id: b, edge: e }); };
  for (const e of graph.edges || []) {
    if (['forward', 'both'].includes(e.impact)) add(e.from, e.to, e);
    if (['reverse', 'both'].includes(e.impact)) add(e.to, e.from, e);
  }
  const queue = [...targets].map(id => ({ id, depth: 0, via: null })), reached = new Map(), frontiers = [];
  const rootSystems = new Set([...targets].filter(id => nodes.get(id)?.type === 'system'));
  for (const e of graph.edges || []) {
    if (targets.has(e.from) && e.type === 'TRANSFORMS' && nodes.get(e.to)?.type === 'system') rootSystems.add(e.to);
  }
  const metadata = new Set(['OWNS', 'WRITES', 'CACHES', 'PERSISTS']);
  while (queue.length) {
    const item = queue.shift(), prior = reached.get(item.id);
    if (prior && (!prior.context_only || item.context_only)) continue;
    reached.set(item.id, item);
    const n = nodes.get(item.id); if (!n) continue;
    if (item.context_only || n.type === 'storage') continue;
    if (item.depth >= maxDepth) {
      if (adjacency.get(item.id)?.some(a => !reached.has(a.id))) frontiers.push({ id: item.id, reason: 'depth limit; audit outward before edits' });
      continue;
    }
    if (item.depth && ['capability', 'test', 'journey', 'privacy', 'issue'].includes(n.type)) continue;
    if (item.depth && n.co_location_hub) {
      frontiers.push({ id: item.id, reason: 'co-location hub; inspect specific function/route, not all unrelated features' });
      continue;
    }
    for (const next of adjacency.get(item.id) || []) queue.push({
      id: next.id,
      depth: item.depth + 1,
      context_only: metadata.has(next.edge.type) && !targets.has(item.id) && !rootSystems.has(item.id),
      via: { from: item.id, edge: next.edge.id, type: next.edge.type, source: next.edge.source },
    });
  }
  for (const item of [...reached.values()]) {
    if (nodes.get(item.id)?.type !== 'capability') continue;
    for (const e of (graph.edges || []).filter(e => e.from === item.id && e.type === 'PROTECTED_BY_TEST')) {
      if (!reached.has(e.to)) reached.set(e.to, { id: e.to, depth: item.depth + 1, via: { from: item.id, edge: e.id, type: e.type, source: e.source } });
    }
    for (const journey of nodes.get(item.id)?.coverage?.golden || []) {
      if (!reached.has(journey)) reached.set(journey, { id: journey, depth: item.depth + 1, via: { from: item.id, type: 'GOLDEN_JOURNEY', source: 'CANONICAL_CONTRACT' } });
    }
  }
  const roots = new Set([...targets, ...rootSystems]);
  for (const e of graph.edges || []) {
    if (!roots.has(e.to) || !['PROJECTS', 'WRITES'].includes(e.type)) continue;
    if (!reached.has(e.from)) reached.set(e.from, { id: e.from, depth: 0, context_only: true, input_boundary: true, via: { from: e.to, edge: e.id, type: e.type, source: e.source } });
  }
  for (const item of [...reached.values()]) {
    const owner = nodes.get(item.id)?.owner;
    if (owner && !reached.has(owner)) reached.set(owner, { id: owner, depth: item.depth + 1, context_only: true, via: { from: item.id, type: 'DECLARED_OWNER', source: 'CANONICAL_CONTRACT' } });
  }
  const found = [...reached.values()].map(r => ({ ...nodes.get(r.id), depth: r.depth, via: r.via }));
  const take = types => found.filter(n => types.includes(n.type));
  const direct = (graph.edges || []).filter(e => targets.has(e.from) || targets.has(e.to));
  return {
    project_name: projectName,
    targets: [...targets], unknown, direct, reached: found, frontiers,
    authorities: take(['authority']), capabilities: take(['capability']), privacy: take(['privacy']),
    state_risks: take(['state', 'cache', 'worker', 'storage']), tests: take(['test']), journeys: take(['journey']), issues: take(['issue']),
    maps: [...new Set([...memoryFiles, ...found.flatMap(n => n.maps || [])])].sort(),
  };
}

export function projectImpact(project, inputs, options = {}) {
  return impact(project.graph, inputs, {
    ...options,
    root: project.root,
    memoryFiles: project.config.memory_files || [],
    projectName: project.config.project_name || path.basename(project.root),
  });
}

export function formatImpact(result) {
  const section = (title, values) => `\n${title}\n${values.length ? values.map(v => typeof v === 'string' ? `- ${v}` : `- ${v.id}: ${v.label || v.type}${v.implemented === false ? ' [NOT IMPLEMENTED]' : ''}${v.live_status ? ` [${v.live_status}]` : ''}`).join('\n') : '- none mapped; this is not proof of no dependency'}\n`;
  const unverified = result.freshness && result.freshness.status !== 'current';
  const rememberedTitle = title => unverified ? `REMEMBERED ${title} — UNVERIFIED` : title;
  const direct = result.freshness
    ? section('VERIFIED CURRENT CONNECTIONS', (result.verified_direct || []).map(e => `${e.from} ${e.type} ${e.to} [${e.source}]`))
      + section('STALE OR UNKNOWN REMEMBERED CONNECTIONS — RECONCILIATION REQUIRED', (result.unverified_direct || []).map(e => `${e.from} ${e.type} ${e.to} [${e.source}; ${e.freshness_status}]`))
    : section('DIRECT CONNECTIONS', result.direct.map(e => `${e.from} ${e.type} ${e.to} [${e.source}]`));
  const freshness = result.freshness
    ? `\nEVIDENCE FRESHNESS\n- status: ${result.freshness.status}\n- baseline: ${result.freshness.baseline}\n- ${result.freshness.disclaimer}${result.freshness.stale?.length ? `\n- stale: ${result.freshness.stale.join(', ')}` : ''}${result.freshness.unknown?.length ? `\n- unknown: ${result.freshness.unknown.join('; ')}` : ''}\n`
    : '';
  return `DURABLE SUBCONSCIOUS IMPACT — ${result.project_name}\n`
    + freshness
    + section('LASER TARGET', result.targets)
    + section('UNKNOWN TARGETS — AUDIT REQUIRED', result.unknown)
    + direct
    + section(rememberedTitle('RECURSIVE BLAST RADIUS (non-boundary nodes)'), result.reached.filter(n => !['capability', 'test', 'journey', 'privacy'].includes(n.type)))
    + section(rememberedTitle('AFFECTED AUTHORITIES'), result.authorities)
    + section(rememberedTitle('AFFECTED CAPABILITIES'), result.capabilities)
    + section(rememberedTitle('PRIVACY RISKS'), result.privacy)
    + section(rememberedTitle('STATE/CACHE/INVALIDATION RISKS'), result.state_risks)
    + section(rememberedTitle('REQUIRED CONTRACT TESTS — SCOPE-LIMITED'), result.tests)
    + section(rememberedTitle('REQUIRED JOURNEYS'), result.journeys)
    + section(rememberedTitle('ACTIVE ISSUES'), result.issues)
    + section(rememberedTitle('RETRIEVAL FRONTIERS — NOT A COMPLETE NEGATIVE PROOF'), result.frontiers.map(f => `${f.id}: ${f.reason}`))
    + section(rememberedTitle('RELEVANT MEMORY FILES'), result.maps);
}
