#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publishArg = process.argv.find((arg) => arg.startsWith('--publish=')) ?? '--publish=never';
const commonBuilderArgs = ['exec', 'electron-builder', '--config', 'electron-builder.config.cjs', '--linux'];
const baseTargets = ['AppImage', 'deb', 'pacman', 'tar.gz'];

run('pnpm', ['build']);
run('pnpm', [...commonBuilderArgs, ...baseTargets, publishArg]);

if (hasCommand('rpmbuild')) {
  run('pnpm', [...commonBuilderArgs, 'rpm', publishArg]);
} else {
  console.warn('[gaia:release] Skipping rpm target because rpmbuild is not installed on this machine.');
  console.warn('[gaia:release] AppImage is still the recommended Fedora and Bazzite update path.');
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hasCommand(command) {
  return spawnSync('sh', ['-lc', `command -v ${command}`], {
    cwd: projectRoot,
    stdio: 'ignore',
  }).status === 0;
}
