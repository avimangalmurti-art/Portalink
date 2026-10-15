import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { build } from 'vite';
import { startupStylesPlugin } from '../scripts/startup-styles.mjs';

test('actual Vite HTML emission runs the main-only gate after generated CSS links exist', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'portalink-startup-styles-'));
  try {
    const html = '<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Font" media="print"></head><body><div id="root">First scene</div><script type="module" src="./entry.js"></script></body></html>';
    for (const entry of ['index.html', 'share.html', 'cite.html']) writeFileSync(join(directory, entry), html);
    writeFileSync(join(directory, 'entry.js'), 'import "./app.css"; document.documentElement.dataset.mounted = "true";');
    writeFileSync(join(directory, 'app.css'), 'body { color: #071326; }');
    await build({ root: directory, configFile: false, logLevel: 'silent', plugins: [startupStylesPlugin()],
      build: { outDir: 'dist', rollupOptions: { input: { main: join(directory, 'index.html'), visitor: join(directory, 'share.html'), citation: join(directory, 'cite.html') } } } });
    for (const entry of ['index.html', 'share.html', 'cite.html']) {
      const emitted = readFileSync(join(directory, 'dist', entry), 'utf8');
      const styles = [...emitted.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="\/assets\/[^>]+>/g)].map(match => match[0]);
      assert.ok(styles.length > 0, `Vite must have emitted real CSS for ${entry}`);
      if (entry === 'index.html') {
        assert.ok(styles.every(tag => /data-portalink-app-style/.test(tag) && /media="print"/.test(tag)));
      } else assert.ok(styles.every(tag => !/data-portalink-app-style|media="print"/.test(tag)));
      assert.match(emitted, /href="https:\/\/fonts\.googleapis\.com\/css\?family=Font" media="print"/);
    }
  } finally {
    // Delete only this test's verified, newly created temporary directory.
    assert.equal(dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(basename(directory).startsWith('portalink-startup-styles-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
