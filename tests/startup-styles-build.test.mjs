import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Run after the production build: the plugin must see Vite's emitted CSS links.
test('emitted MAIN styles are nonblocking and gated; public/citation entries retain normal CSS', () => {
  for (const entry of ['index.html', 'share.html', 'cite.html']) {
    const html = readFileSync(new URL(`../dist/client/${entry}`, import.meta.url), 'utf8');
    const appStyles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="\/assets\/[^>]+>/g)].map(match => match[0]);
    assert.ok(appStyles.length > 0, `${entry} must retain its required CSS`);
    for (const tag of appStyles) {
      if (entry === 'index.html') {
        assert.match(tag, /media="print"/); assert.match(tag, /data-portalink-app-style/);
        assert.match(tag, /this\.media='all'/); assert.match(tag, /portalinkStyleStatus='ready'/);
        assert.match(tag, /portalinkStyleStatus='error'/);
      } else {
        assert.doesNotMatch(tag, /data-portalink-app-style|media="print"/);
      }
    }
    const fonts = html.match(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/[^>]+>/)?.[0];
    if (fonts) { assert.match(fonts, /media="print"/); assert.doesNotMatch(fonts, /data-portalink-app-style/); }
  }
});
