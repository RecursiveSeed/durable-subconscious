// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STATE_DIRECTORY } from './subconscious-lib.mjs';

const MAPS = ['overview', 'authority', 'interfaces', 'lifecycle', 'privacy', 'test-coverage', 'ripples'];

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
    for (const name of MAPS) fs.writeFileSync(path.join(temporary, 'maps', `${name}.md`), mapTemplate(name.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')), { flag: 'wx' });
    fs.renameSync(temporary, target);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return { root: projectRoot, stateDirectory: target, configPath: path.join(target, 'config.json') };
}
