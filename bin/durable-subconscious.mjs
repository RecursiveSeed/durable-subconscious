#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import { initializeProject } from '../src/initialize.mjs';
import { installAgentIntegration, listAgentCompatibility, removeAgentIntegration, restoreAgentIntegration, setupAgent } from '../src/agent-integration.mjs';
import { checkGraph, formatImpact, loadProject, projectCheckOptions, projectImpact } from '../src/subconscious-lib.mjs';
import { discover } from '../src/discover.mjs';

function takeOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (index + 1 >= args.length) throw new Error(`${name} needs a value`);
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function usage() {
  console.log(`Durable Subconscious\n\nCommands:\n  agents\n  setup [project-root] [--agent auto|codex|claude|cursor|copilot|gemini|opencode] [--name NAME]\n  init [project-root] [--name NAME]\n  integrate <agent> [--project ROOT] [--remove | --restore]\n  check [--project ROOT] [--config PATH] [--json] [--strict-coverage]\n  impact <node-id|file-path>... [--project ROOT] [--config PATH] [--json] [--depth N]\n  discover [--project ROOT] [--config PATH]\n`);
}

const args = process.argv.slice(2);
const command = args.shift();
try {
  if (!command || ['help', '--help', '-h'].includes(command)) {
    usage();
  } else if (command === 'agents') {
    if (args.length) throw new Error(`Unknown arguments: ${args.join(' ')}`);
    console.log(JSON.stringify(listAgentCompatibility(), null, 2));
  } else if (command === 'setup') {
    const agent = takeOption(args, '--agent') || 'auto';
    const name = takeOption(args, '--name');
    const root = path.resolve(args.shift() || process.cwd());
    if (args.length) throw new Error(`Unknown arguments: ${args.join(' ')}`);
    console.log(JSON.stringify(setupAgent(root, agent, { projectName: name || path.basename(root) }), null, 2));
  } else if (command === 'init') {
    const name = takeOption(args, '--name');
    const root = path.resolve(args.shift() || process.cwd());
    if (args.length) throw new Error(`Unknown arguments: ${args.join(' ')}`);
    console.log(JSON.stringify(initializeProject(root, { projectName: name || path.basename(root) }), null, 2));
  } else if (command === 'integrate') {
    const agent = args.shift();
    const projectRoot = path.resolve(takeOption(args, '--project') || process.cwd());
    const remove = args.includes('--remove');
    const restore = args.includes('--restore');
    const unknown = args.filter(value => !['--remove', '--restore'].includes(value));
    if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(' ')}`);
    if (!agent) throw new Error('integrate needs an agent name');
    if (remove && restore) throw new Error('Choose either --remove or --restore');
    const result = restore ? restoreAgentIntegration(projectRoot, agent) : remove ? removeAgentIntegration(projectRoot, agent) : installAgentIntegration(projectRoot, agent);
    console.log(JSON.stringify(result, null, 2));
  } else {
    const projectRoot = path.resolve(takeOption(args, '--project') || process.cwd());
    const configPath = takeOption(args, '--config') || undefined;
    const project = loadProject({ root: projectRoot, configPath });
    if (command === 'check') {
      const json = args.includes('--json');
      const strict = args.includes('--strict-coverage');
      const unknown = args.filter(value => !['--json', '--strict-coverage'].includes(value));
      if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(' ')}`);
      const result = checkGraph(project.graph, projectCheckOptions(project));
      if (json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`Durable Subconscious: ${JSON.stringify(result.summary)}`);
        for (const error of result.errors) console.error(`ERROR ${error.code} ${error.id}: ${error.detail}`);
        for (const gap of result.gaps) console.log(`KNOWN GAP ${gap.code} ${gap.id}: ${gap.reason}`);
        console.log('Structural validity is not feature completion. --strict-coverage fails on acknowledged gaps.');
      }
      process.exitCode = result.errors.length || (strict && result.gaps.length) ? 1 : 0;
    } else if (command === 'impact') {
      const json = args.includes('--json');
      const depthValue = takeOption(args, '--depth');
      const maxDepth = depthValue === null ? 8 : Number(depthValue);
      const inputs = args.filter(value => value !== '--json');
      if (!inputs.length) throw new Error('impact needs at least one node ID or file path');
      if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 32) throw new Error('depth must be 1..32');
      const result = projectImpact(project, inputs, { maxDepth });
      console.log(json ? JSON.stringify(result, null, 2) : formatImpact(result));
      if (result.unknown.length) process.exitCode = 2;
    } else if (command === 'discover') {
      if (args.length) throw new Error(`Unknown arguments: ${args.join(' ')}`);
      const files = project.graph.nodes.filter(node => node.type === 'module' && node.path && node.discovery !== false).map(node => node.path);
      console.log(JSON.stringify(discover(files, { root: project.root, forbiddenPathSegments: project.config.forbidden_path_segments || [] }), null, 2));
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  }
} catch (error) {
  console.error(`Durable Subconscious blocked: ${error.message}`);
  process.exitCode = 1;
}
