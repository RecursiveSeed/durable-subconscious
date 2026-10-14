#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// This file is copied into each update transaction before package replacement.
// Keep it standalone: it must not import code from the package being replaced.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const transactionFile = path.resolve(process.argv[2] || '');
const mode = process.argv[3] || 'apply';
if (!transactionFile || !fs.existsSync(transactionFile)) {
  console.error('Durable Subconscious update helper: transaction file is missing');
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(transactionFile, 'utf8'));
const transactionDirectory = path.dirname(transactionFile);
const runtimeFile = path.join(transactionDirectory, 'runtime.json');
const resultFile = path.join(transactionDirectory, 'helper-result.json');

function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.new`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temporary, file);
}

function insideRoot(relative) {
  const root = path.resolve(plan.project_root);
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`Update path escapes project root: ${relative}`);
  return target;
}

function removeEntry(target) {
  if (!fs.existsSync(target) && !fs.lstatSync(path.dirname(target), { throwIfNoEntry: false })) return;
  try { fs.rmSync(target, { recursive: true, force: true }); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function copyEntry(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, dereference: false, force: false, errorOnExist: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
}

function npmInvocation(args) {
  if (process.platform !== 'win32') return { command: 'npm', args };
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(cli)) throw new Error(`npm CLI was not found beside Node.js: ${cli}`);
  return { command: process.execPath, args: [cli, ...args] };
}

function versionMatches(version, pattern) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return false;
  if (/^\d+\.x$/.test(pattern)) return Number(pattern.split('.')[0]) === Number(match[1]);
  if (/^\d+\.\d+\.x$/.test(pattern)) {
    const [major, minor] = pattern.split('.').map(Number);
    return major === Number(match[1]) && minor === Number(match[2]);
  }
  return version === pattern;
}

function validateTargetPackage(packageJson) {
  if (packageJson.name !== 'durable-subconscious') throw new Error(`Staged package name is ${packageJson.name || 'missing'}, expected durable-subconscious`);
  if (packageJson.version !== plan.target_version) throw new Error(`Staged package version ${packageJson.version || 'missing'} does not match requested ${plan.target_version}`);
  const supported = packageJson.durableSubconscious?.supportedUpgradeFrom;
  if (!Array.isArray(supported) || !supported.some(pattern => versionMatches(plan.current_version, pattern))) {
    throw new Error(`Target ${plan.target_version} does not declare a supported upgrade from ${plan.current_version}`);
  }
}

function saveRuntime(runtime) {
  atomicJson(runtimeFile, runtime);
}

function backUp(runtime) {
  const backupRoot = path.join(transactionDirectory, 'backups');
  fs.mkdirSync(backupRoot, { recursive: true });
  runtime.status = 'backing_up';
  saveRuntime(runtime);
  for (let index = runtime.files.length; index < plan.mutable_files.length; index += 1) {
    const relative = plan.mutable_files[index];
    const target = insideRoot(relative);
    const backup = path.join(backupRoot, String(index));
    const existed = fs.existsSync(target);
    if (existed) copyEntry(target, backup);
    runtime.files.push({ relative, existed, backup: path.relative(transactionDirectory, backup).replace(/\\/g, '/') });
    saveRuntime(runtime);
  }
  const packageTarget = insideRoot(plan.package_directory);
  const packageBackup = path.join(transactionDirectory, 'package-backup');
  if (!runtime.package_backup_recorded) {
    runtime.package_existed = fs.existsSync(packageTarget);
    if (runtime.package_existed) copyEntry(packageTarget, packageBackup);
    runtime.package_backup_recorded = true;
    saveRuntime(runtime);
  }
}

function restore(runtime) {
  for (const entry of [...(runtime.files || [])].reverse()) {
    const target = insideRoot(entry.relative);
    removeEntry(target);
    if (entry.existed) copyEntry(path.join(transactionDirectory, entry.backup), target);
  }
  if (runtime.package_backup_recorded) {
    const packageTarget = insideRoot(plan.package_directory);
    removeEntry(packageTarget);
    if (runtime.package_existed) copyEntry(path.join(transactionDirectory, 'package-backup'), packageTarget);
  }
  runtime.status = 'rolled_back';
  runtime.rolled_back_at = new Date().toISOString();
  saveRuntime(runtime);
}

function stageTarget(runtime) {
  runtime.status = 'staging';
  saveRuntime(runtime);
  const stageRoot = path.join(transactionDirectory, 'staged-package');
  fs.mkdirSync(stageRoot, { recursive: true });
  const npm = npmInvocation(['install', '--prefix', stageRoot, '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund', plan.source_spec]);
  const staged = run(npm.command, npm.args, transactionDirectory);
  runtime.stage = staged;
  saveRuntime(runtime);
  if (staged.status !== 0) throw new Error(`Unable to stage target package: ${staged.stderr.trim() || staged.stdout.trim()}`);
  const packageJsonPath = path.join(stageRoot, 'node_modules', 'durable-subconscious', 'package.json');
  if (!fs.existsSync(packageJsonPath)) throw new Error('Staged package did not contain durable-subconscious');
  validateTargetPackage(JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')));
}

function installedPackageJson() {
  const file = insideRoot(`${plan.package_directory.replace(/\\/g, '/')}/package.json`);
  if (!fs.existsSync(file)) throw new Error('Installed Durable Subconscious package metadata is missing');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function apply() {
  const runtime = fs.existsSync(runtimeFile)
    ? JSON.parse(fs.readFileSync(runtimeFile, 'utf8'))
    : { status: 'planned', files: [], package_backup_recorded: false };
  if (['applying', 'finalizing'].includes(runtime.status)) throw new Error('Transaction is already in progress; recover it before retrying');
  if (plan.bootstrap) validateTargetPackage(installedPackageJson());
  else stageTarget(runtime);
  backUp(runtime);
  runtime.status = 'applying';
  runtime.mutation_started = true;
  saveRuntime(runtime);
  if (!plan.bootstrap) {
    const npm = npmInvocation(['install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', plan.source_spec]);
    const installed = run(npm.command, npm.args, plan.project_root);
    runtime.install = installed;
    saveRuntime(runtime);
    if (installed.status !== 0) throw new Error(`Package installation failed: ${installed.stderr.trim() || installed.stdout.trim()}`);
  }
  if (process.env.DURABLE_SUBCONSCIOUS_UPDATE_INTERRUPT_AFTER_INSTALL === '1') process.exit(86);
  validateTargetPackage(installedPackageJson());
  runtime.status = 'finalizing';
  saveRuntime(runtime);
  const cli = insideRoot(`${plan.package_directory.replace(/\\/g, '/')}/bin/durable-subconscious.mjs`);
  const finalized = run(process.execPath, [cli, 'update-finalize', '--project', plan.project_root, '--transaction', transactionFile], plan.project_root);
  runtime.finalize = finalized;
  saveRuntime(runtime);
  if (finalized.status !== 0) throw new Error(`Installed package verification failed: ${finalized.stderr.trim() || finalized.stdout.trim()}`);
  const finalResultFile = path.join(transactionDirectory, 'finalize-result.json');
  if (!fs.existsSync(finalResultFile)) throw new Error('Installed package did not write a final verification result');
  const finalResult = JSON.parse(fs.readFileSync(finalResultFile, 'utf8'));
  runtime.status = 'complete';
  runtime.completed_at = new Date().toISOString();
  saveRuntime(runtime);
  for (const disposable of ['backups', 'package-backup', 'staged-package']) removeEntry(path.join(transactionDirectory, disposable));
  atomicJson(resultFile, { status: 'complete', transaction_id: plan.transaction_id, result: finalResult });
}

try {
  if (mode === 'rollback') {
    const runtime = fs.existsSync(runtimeFile) ? JSON.parse(fs.readFileSync(runtimeFile, 'utf8')) : { status: 'planned', files: [] };
    if (runtime.status === 'complete') throw new Error('Completed transactions do not retain rollback backups');
    restore(runtime);
    for (const disposable of ['backups', 'package-backup', 'staged-package']) removeEntry(path.join(transactionDirectory, disposable));
    atomicJson(resultFile, { status: 'rolled_back', transaction_id: plan.transaction_id });
  } else {
    try {
      apply();
    } catch (error) {
      const runtime = fs.existsSync(runtimeFile) ? JSON.parse(fs.readFileSync(runtimeFile, 'utf8')) : { status: 'failed_preflight', files: [] };
      runtime.error = error.message;
      if (runtime.mutation_started || runtime.package_backup_recorded) {
        restore(runtime);
        for (const disposable of ['backups', 'package-backup', 'staged-package']) removeEntry(path.join(transactionDirectory, disposable));
      }
      else {
        runtime.status = 'failed_preflight';
        saveRuntime(runtime);
        removeEntry(path.join(transactionDirectory, 'staged-package'));
      }
      atomicJson(resultFile, { status: runtime.status, transaction_id: plan.transaction_id, error: error.message });
      throw error;
    }
  }
} catch (error) {
  console.error(`Durable Subconscious update helper blocked: ${error.message}`);
  process.exitCode = 1;
}
