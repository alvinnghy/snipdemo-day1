import { appendFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = join(root, 'frontend');
const bundle = join(root, 'bundle');
const publicDir = join(bundle, 'public');
const push = process.argv.slice(2);

if (push.some((arg) => arg !== '--push') || push.length > 1) {
  throw new Error('Usage: node scripts/build-bundle.mjs [--push]');
}

const shouldPush = push.includes('--push');
const windows = process.platform === 'win32';
let bundleChanged = false;
let mainChanged = false;

function run(command, args, cwd = root) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: windows && /\.(cmd|bat)$/i.test(command),
  });
}

function stagedChanges(cwd) {
  const result = spawnSync('git', ['diff', '--cached', '--quiet'], {
    cwd,
    stdio: 'ignore',
  });
  if (result.error) throw result.error;
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error(`git diff --cached --quiet failed in ${cwd} (${result.status})`);
}

run('git', ['submodule', 'update', '--init', '--remote', 'backend', 'frontend', 'cli']);
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], frontend);
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['ng', 'build'], frontend);

const frontendBuild = join(frontend, 'dist', 'snip-frontend', 'browser');
const indexFile = join(frontendBuild, 'index.html');
if (!existsSync(indexFile)) {
  throw new Error(`Expected Angular build output at ${indexFile}`);
}

mkdirSync(bundle, { recursive: true });
rmSync(publicDir, { recursive: true, force: true });
cpSync(join(root, 'backend', 'server.js'), join(bundle, 'server.js'));
cpSync(join(root, 'cli', 'cli.js'), join(bundle, 'cli.js'));
cpSync(frontendBuild, publicDir, { recursive: true });
writeFileSync(join(bundle, '.env'), 'PUBLIC_DIR=./public\n');
writeFileSync(
  join(bundle, 'package.json'),
  `${JSON.stringify({ name: 'snip-bundle', scripts: { start: 'bun server.js' } }, null, 2)}\n`,
);
writeFileSync(
  join(bundle, 'Dockerfile'),
  [
    'FROM oven/bun:1-alpine',
    'WORKDIR /app',
    'COPY . .',
    'ENV PORT=3000',
    'EXPOSE 3000',
    'CMD ["bun", "server.js"]',
    '',
  ].join('\n'),
);
writeFileSync(
  join(bundle, '.dockerignore'),
  ['.git', '.gitmodules', 'node_modules', '*.log', '',].join('\n'),
);
writeFileSync(
  join(bundle, 'railway.json'),
  `${JSON.stringify({ build: { builder: 'DOCKERFILE' } }, null, 2)}\n`,
);

run('git', ['add', '-A'], bundle);
if (stagedChanges(bundle)) {
  bundleChanged = true;
  run('git', [
    '-c',
    'user.name=OpenBot',
    '-c',
    'user.email=335604065+openbotgit[bot]@users.noreply.github.com',
    'commit',
    '-m',
    'Build generated Snip release bundle',
    '-m',
    'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>',
  ], bundle);
} else {
  console.log('Bundle unchanged; nothing to commit.');
}

run('git', ['add', '.gitmodules', 'backend', 'frontend', 'cli', 'bundle']);
if (stagedChanges(root)) {
  mainChanged = true;
  run('git', [
    '-c',
    'user.name=OpenBot',
    '-c',
    'user.email=335604065+openbotgit[bot]@users.noreply.github.com',
    'commit',
    '-m',
    'Update source and bundle submodule pointers',
    '-m',
    'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>',
  ]);
} else {
  console.log('Superproject pointers unchanged; nothing to commit.');
}

let changed = bundleChanged || mainChanged;
if (shouldPush) {
  run('git', ['fetch', 'origin', 'bundle'], bundle);
  const bundleAhead = Number(
    execFileSync('git', ['rev-list', '--count', 'origin/bundle..HEAD'], {
      cwd: bundle,
      encoding: 'utf8',
    }).trim(),
  ) > 0;
  run('git', ['push', 'origin', 'HEAD:bundle'], bundle);

  run('git', ['fetch', 'origin', 'main']);
  const mainAhead = Number(
    execFileSync('git', ['rev-list', '--count', 'origin/main..HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
  ) > 0;
  run('git', ['push', 'origin', 'main']);
  changed ||= bundleAhead || mainAhead;
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}
