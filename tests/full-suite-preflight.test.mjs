import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('full-suite runner requires emitted visitor artifacts before running tests', () => {
  const root = mkdtempSync(join(tmpdir(), 'portalink-suite-preflight-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'tests'));
    const runner = join(root, 'scripts/run-node-tests.mjs');
    copyFileSync(new URL('../scripts/run-node-tests.mjs', import.meta.url), runner);
    const databaseModule = join(root, 'database-fixture.mjs');
    writeFileSync(databaseModule, 'export {};');
    writeFileSync(join(root, 'tests/sentinel.test.mjs'), "import test from 'node:test'; test('sentinel', () => {});");
    const env = { ...process.env, PGLITE_MODULE_PATH: databaseModule };
    // The subprocess is a standalone runner, not this test's nested worker.
    delete env.NODE_TEST_CONTEXT;
    const run = () => spawnSync(process.execPath, [runner], {
      cwd: root, encoding: 'utf8', windowsHide: true,
      env,
    });
    let result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Run npm\.cmd run build before the full suite/);
    assert.doesNotMatch(result.stdout, /sentinel/);
    mkdirSync(join(root, 'logs'));
    mkdirSync(join(root, 'dist/client/.vite'), { recursive: true });
    writeFileSync(join(root, 'logs/client-module-graph.json'), '[]');
    writeFileSync(join(root, 'dist/client/.vite/manifest.json'), '{}');
    result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /sentinel/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
