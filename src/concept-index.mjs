// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { applyFreshnessToImpact, verifyImpactFreshness } from './freshness.mjs';
import { loadProject, projectImpact, safeProjectPath } from './subconscious-lib.mjs';

export const CONCEPT_INDEX_SCHEMA_VERSION = 1;
export const DEFAULT_CONCEPT_LIMIT = 5;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'does', 'for', 'from',
  'how', 'i', 'in', 'is', 'it', 'of', 'on', 'or', 'our', 'the', 'this', 'to',
  'what', 'where', 'which', 'with', 'your',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedText(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function terms(value) {
  return [...new Set(normalizedText(value).split(/\s+/).filter(term => term.length > 1 && !STOP_WORDS.has(term)))];
}

function candidateForNode(node) {
  const aliases = Array.isArray(node.aliases)
    ? node.aliases.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
    : [];
  return {
    id: node.id,
    type: node.type,
    label: typeof node.label === 'string' ? node.label : '',
    path: typeof node.path === 'string' ? node.path.replace(/\\/g, '/') : '',
    aliases,
  };
}

function fields(candidate) {
  return {
    id: terms(candidate.id),
    label: terms(candidate.label),
    aliases: terms(candidate.aliases.join(' ')),
    path: terms(candidate.path),
    type: terms(candidate.type),
  };
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

export function conceptIndexPath(project) {
  if (project.config.concept_index) {
    const configured = safeProjectPath(project.root, project.config.concept_index, {
      forbiddenPathSegments: project.config.forbidden_path_segments || [],
    });
    if (!configured) throw new Error('Configured concept index path is outside the project boundary');
    return configured;
  }
  return path.join(path.dirname(project.configPath), 'concept-index.json');
}

export function graphFingerprint(project) {
  return sha256(fs.readFileSync(project.graphPath));
}

export function buildConceptIndex(project) {
  const before = graphFingerprint(project);
  const candidates = (project.graph.nodes || []).filter(node => node?.id && node?.type).map(candidateForNode);
  const index = {
    schema_version: CONCEPT_INDEX_SCHEMA_VERSION,
    authority: 'navigation-cache-only',
    graph_sha256: before,
    entries: candidates.map(candidate => [candidate.id, candidate.type, candidate.label, candidate.path, candidate.aliases]),
  };
  if (graphFingerprint(project) !== before) throw new Error('Authoritative graph changed while building the concept index; retry the query');
  return index;
}

function validIndex(index, project) {
  return index?.schema_version === CONCEPT_INDEX_SCHEMA_VERSION
    && index.authority === 'navigation-cache-only'
    && index.graph_sha256 === graphFingerprint(project)
    && Array.isArray(index.entries)
    && index.entries.every(entry => Array.isArray(entry) && entry.length === 5);
}

export function ensureConceptIndex(project, { rebuild = false } = {}) {
  const file = conceptIndexPath(project);
  const existed = fs.existsSync(file);
  if (!rebuild && fs.existsSync(file)) {
    try {
      const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (validIndex(existing, project)) return { index: existing, path: file, status: 'current' };
    } catch {}
  }
  const index = buildConceptIndex(project);
  atomicWrite(file, `${JSON.stringify(index)}\n`);
  if (graphFingerprint(project) !== index.graph_sha256) throw new Error('Authoritative graph changed while publishing the concept index; retry the query');
  return { index, path: file, status: existed ? 'rebuilt' : 'created' };
}

function scoreCandidate(candidate, query, queryTerms) {
  const normalizedQuery = normalizedText(query);
  const candidateFields = fields(candidate);
  const weights = { id: 7, label: 10, aliases: 12, path: 4, type: 2 };
  const matched = new Set();
  let score = 0;
  for (const [field, values] of Object.entries(candidateFields)) {
    for (const term of queryTerms) {
      if (values.includes(term)) {
        matched.add(term);
        score += weights[field];
      }
    }
  }
  const exactId = candidate.id.toLowerCase() === String(query).trim().toLowerCase();
  const exactPath = candidate.path && candidate.path.toLowerCase() === String(query).trim().replace(/\\/g, '/').toLowerCase();
  const exactLabel = normalizedText(candidate.label) === normalizedQuery;
  const exactAlias = candidate.aliases.some(alias => normalizedText(alias) === normalizedQuery);
  if (exactId) score += 1000;
  if (exactPath) score += 900;
  if (exactAlias) score += 800;
  if (exactLabel) score += 700;
  if (normalizedQuery.length > 3 && normalizedText(candidate.label).includes(normalizedQuery)) score += 40;
  if (normalizedQuery.length > 3 && candidate.aliases.some(alias => normalizedText(alias).includes(normalizedQuery))) score += 45;
  const coverage = queryTerms.length ? matched.size / queryTerms.length : 0;
  score += Math.round(coverage * 25);
  return {
    score,
    coverage,
    matched_terms: [...matched].sort(),
    exact: exactId || exactPath || exactLabel || exactAlias,
    exact_identity: exactId || exactPath,
  };
}

export function searchConceptIndex(conceptIndex, query, { limit = DEFAULT_CONCEPT_LIMIT } = {}) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('Concept query must not be empty');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Concept result limit must be 1..20');
  const queryTerms = terms(query);
  const ranked = conceptIndex.entries
    .map(entry => {
      const candidate = { id: entry[0], type: entry[1], label: entry[2], path: entry[3], aliases: entry[4] };
      return { ...candidate, ...scoreCandidate(candidate, query, queryTerms) };
    })
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage || a.id.localeCompare(b.id))
    .slice(0, limit);
  const top = ranked[0];
  const second = ranked[1];
  const ambiguous = Boolean(top && second && !top.exact_identity && second.score >= top.score * 0.8);
  return {
    query,
    candidates: ranked,
    ambiguous,
    reason: !top
      ? queryTerms.length ? 'No matching graph identity' : 'No searchable concept terms or exact identity'
      : ambiguous ? 'Competing candidates require an explicit selection' : null,
  };
}

function authoritativeLocation(node) {
  if (node?.path) return node.path;
  if (node?.evidence?.length) return node.evidence[0];
  if (node?.maps?.length) return node.maps[0];
  return null;
}

export function queryConcept(project, query, {
  limit = DEFAULT_CONCEPT_LIMIT,
  maxDepth = 1,
  selectId = null,
  rebuild = false,
} = {}) {
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 32) throw new Error('depth must be 1..32');
  const currentProject = loadProject({ root: project.root, configPath: project.configPath });
  const cached = ensureConceptIndex(currentProject, { rebuild });
  const search = searchConceptIndex(cached.index, query, { limit });
  let selected = null;
  if (selectId) {
    selected = search.candidates.find(candidate => candidate.id === selectId);
    if (!selected) throw new Error(`Selected identity is not one of the returned candidates: ${selectId}`);
  } else if (!search.ambiguous) {
    selected = search.candidates[0] || null;
  }
  let resolution = null;
  if (selected) {
    const remembered = projectImpact(currentProject, [selected.id], { maxDepth });
    resolution = applyFreshnessToImpact(remembered, verifyImpactFreshness(currentProject, remembered));
  }
  return {
    query,
    index: {
      status: cached.status,
      schema_version: cached.index.schema_version,
      authority: cached.index.authority,
      graph_sha256: cached.index.graph_sha256,
      candidates: cached.index.entries.length,
    },
    candidates: search.candidates.map(candidate => ({
      ...candidate,
      authoritative_location: authoritativeLocation(currentProject.graph.nodes.find(node => node.id === candidate.id)),
    })),
    ambiguous: search.ambiguous,
    selection_required: search.ambiguous && !selectId,
    reason: search.reason,
    selected: selected?.id || null,
    resolution,
  };
}
