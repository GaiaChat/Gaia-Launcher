#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await rm(join(projectRoot, 'dist'), { recursive: true, force: true });
run('tsc', ['-p', 'tsconfig.main.json']);
await mkdir(join(projectRoot, 'dist', 'assets'), { recursive: true });
await cp(join(projectRoot, 'src', 'assets', 'logo.svg'), join(projectRoot, 'dist', 'assets', 'logo.svg'));
await cp(
  join(projectRoot, 'src', 'assets', 'logo_grayscale.svg'),
  join(projectRoot, 'dist', 'assets', 'logo_grayscale.svg'),
);
await cp(join(projectRoot, 'src', 'assets', 'appicon'), join(projectRoot, 'dist', 'assets', 'appicon'), {
  recursive: true,
});
run('vite', ['build']);

function run(command, args) {
  const binary = process.platform === 'win32' ? `${command}.cmd` : command;
  const result = spawnSync(binary, args, {
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
