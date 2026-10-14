// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STATE_DIRECTORY } from './subconscious-lib.mjs';
import { INSTALLATION_SCHEMA_VERSION, PACKAGE_VERSION, UPDATE_COMPATIBILITY } from './version.mjs';

const MAPS = ['overview', 'authority', 'interfaces', 'lifecycle', 'privacy', 'test-coverage', 'ripples'];

export const FRESHNESS_GUIDE_BLOCK_START = '<!-- durable-subconscious:freshness-guide:start -->';
export const FRESHNESS_GUIDE_BLOCK_END = '<!-- durable-subconscious:freshness-guide:end -->';
export const CONCEPT_GUIDE_BLOCK_START = '<!-- durable-subconscious:concept-guide:start -->';
export const CONCEPT_GUIDE_BLOCK_END = '<!-- durable-subconscious:concept-guide:end -->';
export const UPDATE_GUIDE_BLOCK_START = '<!-- durable-subconscious:update-guide:start -->';
export const UPDATE_GUIDE_BLOCK_END = '<!-- durable-subconscious:update-guide:end -->';

const FRESHNESS_GUIDE_BLOCK = `${FRESHNESS_GUIDE_BLOCK_START}
## Freshness and reconciliation requirements (managed)

These requirements supersede any older lifecycle steps above when they conflict.
Before relying on remembered relationships, run a relevant impact query and treat
stale or unknown evidence as unverified. Inspect current source before proceeding.
Read-only check, impact, and discovery commands never advance the trusted baseline.

After evidence-backed graph/map updates and project tests, explicitly run:

   npx --no-install durable-subconscious reconcile --project . --accept-current-evidence

Then run check and the relevant impact query again. Preserve typed uncertainty;
never accept a changed baseline merely because files were scanned.

For the developer instruction “Check my recent project changes, identify affected
dependencies, reconcile your subconscious with current source evidence, and report
anything that remains uncertain,” inspect actual changes, reconcile only supported
knowledge, validate, and report both updates and unresolved uncertainty.
${FRESHNESS_GUIDE_BLOCK_END}`;

const CONCEPT_GUIDE_BLOCK = `${CONCEPT_GUIDE_BLOCK_START}
## Conceptual retrieval requirements (managed)

When the exact graph identity or path is unknown, begin with a focused conceptual
query instead of a broad project audit:

   npx --no-install durable-subconscious query <concept words> --project . --depth 1

The concept index is a derived navigation cache, never evidence authority. If the
result is ambiguous, inspect the focused candidates and rerun with --select. Rely
on a relationship only after the returned impact/freshness result verifies it.
Increase depth deliberately when the disclosed frontier is relevant.
${CONCEPT_GUIDE_BLOCK_END}`;

const UPDATE_GUIDE_BLOCK = `${UPDATE_GUIDE_BLOCK_START}
## Software update requirements (managed)

Treat package updates and knowledge reconciliation as separate operations. First
run the update command without --apply to review its exact plan. Apply only a
supported stable transition, preserve project knowledge and authored instructions,
and report freshness or unresolved relationships without accepting new evidence.
Use INSTALL.md for the one-time v0.3/v0.4 bootstrap and rollback procedure.
${UPDATE_GUIDE_BLOCK_END}`;

export const AGENT_GUIDE = `# Durable Subconscious project guide

This directory is project-local architectural memory. Project source and accepted
project documents remain authoritative. Never invent a relationship merely to make
validation pass.

## First mapping

1. Inspect the project instructions, source, tests, configuration, and accepted
   architecture documents.
2. Replace the starter graph with evidence-backed nodes and edges. Keep the
   project and project-maintainer nodes only when the evidence supports them.
3. Populate every configured map with current evidence, explicit uncertainty, and
   project-relative source paths.
4. For every capability, provide coverage.human_task and one or more
   coverage.golden journey node IDs. Accepted capabilities also require an
   implemented producer and an executable test through the corresponding typed
   edges.
5. Configure expected_capability_count and required_capability_ids from the mapped
   project. Do not disable capability coverage to obtain a pass.
6. Run the project tests and then run:

   npx --no-install durable-subconscious reconcile --project . --accept-current-evidence
   npx --no-install durable-subconscious check --project . --strict-coverage

See node_modules/durable-subconscious/docs/SCHEMA.md for the complete schema and
examples/synthetic-project for a synthetic reference.

## Every relevant development session

Read config.json and the relevant configured maps. Before a material change, run
impact for the files, node IDs, or capability IDs in scope. Do not treat stale or
unknown relationships as verified facts. Investigate freshness failures, unknown
targets, and disclosed frontiers before editing. After verified changes, update the
graph and maps, preserve historical evidence and unresolved gaps, run the affected
project tests, then explicitly reconcile the reviewed evidence with:

   npx --no-install durable-subconscious reconcile --project . --accept-current-evidence

Run check and impact again after reconciliation. Do not finish the change until the
post-change impact query has been executed against the updated knowledge.

When a developer asks, “Check my recent project changes, identify affected
dependencies, reconcile your subconscious with current source evidence, and report
anything that remains uncertain,” inspect the actual changes and affected source,
compare them with the graph and maps, update only evidence-supported knowledge,
retain unresolved uncertainty, run tests and validation, reconcile explicitly, and
report both updates and remaining uncertainty.

Structural success is not proof of complete coverage. The tool cannot discover all
semantic capabilities automatically; source changes can make an unmaintained graph
stale even while check succeeds.

${FRESHNESS_GUIDE_BLOCK}

${CONCEPT_GUIDE_BLOCK}

${UPDATE_GUIDE_BLOCK}
`;

function mapTemplate(title) {
  return `# ${title}\n\nRecord current, evidence-backed knowledge here. Keep intended behavior, implemented behavior, and unresolved gaps distinct.\n`;
}

export function initializeProject(root, { projectName = path.basename(path.resolve(root)) } = {}) {
  const projectRoot = path.resolve(root);
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) throw new Error('Project root must be an existing directory');
  const target = path.join(projectRoot, DEFAULT_STATE_DIRECTORY);
  if (fs.existsSync(target)) throw new Error(`${DEFAULT_STATE_DIRECTORY} already exists; initialization never overwrites project knowledge`);
  const temporary = path.join(projectRoot, `${DEFAULT_STATE_DIRECTORY}.init-${process.pid}-${Date.now()}`);
  const relativeMaps = MAPS.map(name => `${DEFAULT_STATE_DIRECTORY}/maps/${name}.md`);
  const config = {
    schema_version: 1,
    project_name: projectName,
    agent_guide: `${DEFAULT_STATE_DIRECTORY}/agent-guide.md`,
    graph: `${DEFAULT_STATE_DIRECTORY}/graph.json`,
    freshness: `${DEFAULT_STATE_DIRECTORY}/freshness.json`,
    concept_index: `${DEFAULT_STATE_DIRECTORY}/concept-index.json`,
    memory_files: relativeMaps,
    forbidden_path_segments: ['.git', 'node_modules', '.env', 'secrets', 'credentials'],
    graph_rules: {
      capability_coverage_required: true,
      expected_capability_count: null,
      required_capability_ids: [],
    },
  };
  const graph = {
    schema_version: 1,
    format: 'JSON-form YAML 1.2',
    project: projectName,
    nodes: [
      { id: 'project.maintainer', type: 'authority', label: 'Project maintainer' },
      { id: 'project', type: 'system', label: projectName, owner: 'project.maintainer', maps: relativeMaps },
    ],
    edges: [
      {
        id: 'project-maintainer-owns-project',
        from: 'project.maintainer',
        type: 'OWNS',
        to: 'project',
        source: 'CANONICAL_CONTRACT',
        impact: 'forward',
        evidence: [{ path: `${DEFAULT_STATE_DIRECTORY}/maps/authority.md` }],
      },
    ],
  };
  try {
    fs.mkdirSync(path.join(temporary, 'maps'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'config.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(temporary, 'graph.json'), JSON.stringify(graph, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(temporary, 'agent-guide.md'), AGENT_GUIDE, { flag: 'wx' });
    fs.writeFileSync(path.join(temporary, 'installation.json'), `${JSON.stringify({
      schema_version: INSTALLATION_SCHEMA_VERSION,
      installed_version: PACKAGE_VERSION,
      state_schema: UPDATE_COMPATIBILITY.state_schema,
      graph_schema: UPDATE_COMPATIBILITY.graph_schema,
      freshness_schema: UPDATE_COMPATIBILITY.freshness_schema,
      package_spec: null,
      integration_adapters: [],
    }, null, 2)}\n`, { flag: 'wx' });
    for (const name of MAPS) fs.writeFileSync(path.join(temporary, 'maps', `${name}.md`), mapTemplate(name.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')), { flag: 'wx' });
    fs.renameSync(temporary, target);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return { root: projectRoot, stateDirectory: target, configPath: path.join(target, 'config.json') };
}

export function ensureAgentGuide(root) {
  const projectRoot = path.resolve(root);
  const stateDirectory = path.join(projectRoot, DEFAULT_STATE_DIRECTORY);
  if (!fs.existsSync(path.join(stateDirectory, 'config.json'))) throw new Error('Initialize Durable Subconscious before installing an agent integration');
  const guide = path.join(stateDirectory, 'agent-guide.md');
  if (!fs.existsSync(guide)) {
    fs.writeFileSync(guide, AGENT_GUIDE, { encoding: 'utf8', flag: 'wx' });
    return { path: guide, created: true, updated: false };
  }
  const current = fs.readFileSync(guide, 'utf8');
  const replaceManaged = (value, start, end, block, label) => {
    const starts = value.split(start).length - 1;
    const ends = value.split(end).length - 1;
    if (starts !== ends || starts > 1) throw new Error(`Agent guide has malformed or duplicate ${label} markers; refusing to overwrite it`);
    return starts === 0
      ? `${value.trimEnd()}\n\n${block}\n`
      : `${value.slice(0, value.indexOf(start))}${block}${value.slice(value.indexOf(end) + end.length)}`;
  };
  let next = replaceManaged(current, FRESHNESS_GUIDE_BLOCK_START, FRESHNESS_GUIDE_BLOCK_END, FRESHNESS_GUIDE_BLOCK, 'freshness');
  next = replaceManaged(next, CONCEPT_GUIDE_BLOCK_START, CONCEPT_GUIDE_BLOCK_END, CONCEPT_GUIDE_BLOCK, 'concept');
  next = replaceManaged(next, UPDATE_GUIDE_BLOCK_START, UPDATE_GUIDE_BLOCK_END, UPDATE_GUIDE_BLOCK, 'update');
  if (next === current) return { path: guide, created: false, updated: false };
  const temporary = `${guide}.${process.pid}.${Date.now()}.new`;
  fs.writeFileSync(temporary, next, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(temporary, guide);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
  return { path: guide, created: false, updated: true };
}
