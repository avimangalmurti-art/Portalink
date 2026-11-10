// Run the complete existing Node suite on Windows and Unix without shell globs.
// Database coverage is required here; focused `node --test` runs remain available.
import { access, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const databaseModule = process.env.PGLITE_MODULE_PATH ?? process.env.PGLITE_MODULE;
if (!databaseModule) {
  console.error('Set PGLITE_MODULE_PATH to the existing @electric-sql/pglite dist/index.js to run required database checks. See docs/development-workflow.md.');
  process.exit(1);
}
await access(databaseModule);
try {
  await access(resolve(root, 'logs/client-module-graph.json'));
  await access(resolve(root, 'dist/client/.vite/manifest.json'));
} catch {
  console.error('Run npm.cmd run build before the full suite: visitor-entry-build tests verify emitted bundle artifacts. See docs/development-workflow.md.');
  process.exit(1);
}
// The child already runs from the repo root. Relative paths keep the argument
// list within Windows' command-line limit in deeply nested checkouts.
const files = (await readdir(new URL('../tests/', import.meta.url)))
  .filter(name => name.endsWith('.test.mjs')).sort().map(name => join('tests', name));
const child = spawn(process.execPath, ['--test', '--test-concurrency=2', ...files], {
  cwd: root,
  env: { ...process.env, PGLITE_MODULE_PATH: databaseModule, PGLITE_MODULE: databaseModule },
  stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
