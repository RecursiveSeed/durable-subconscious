// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STATE_DIRECTORY } from './subconscious-lib.mjs';

const MAPS = ['overview', 'authority', 'interfaces', 'lifecycle', 'privacy', 'test-coverage', 'ripples'];

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

   npx --no-install durable-subconscious check --project . --strict-coverage

See node_modules/durable-subconscious/docs/SCHEMA.md for the complete schema and
examples/synthetic-project for a synthetic reference.

## Every relevant development session

Read config.json and the relevant configured maps. Before a material change, run
impact for the files, node IDs, or capability IDs in scope. Investigate unknown
targets and disclosed frontiers before editing. After verified changes, update the
graph and maps, preserve historical evidence and unresolved gaps, then run check,
the affected project tests, and impact again. Do not finish the change until the
post-change impact query has been executed against the updated knowledge.

Structural success is not proof of complete coverage. The tool cannot discover all
semantic capabilities automatically; source changes can make an unmaintained graph
stale even while check succeeds.
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
  if (fs.existsSync(guide)) return { path: guide, created: false };
  fs.writeFileSync(guide, AGENT_GUIDE, { encoding: 'utf8', flag: 'wx' });
  return { path: guide, created: true };
}
