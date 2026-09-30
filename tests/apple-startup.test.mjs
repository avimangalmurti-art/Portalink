import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync, crc32 } from 'node:zlib';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('Apple startup links resolve to opaque device-sized backgrounds in both orientations', () => {
  const links = [...html.matchAll(/<link rel="apple-touch-startup-image" href="([^"]+)" media="([^"]+)"/g)];
  assert.ok(links.length >= 22);
  const mediaSeen = new Set();
  for (const [, href, media] of links) {
    assert.ok(!mediaSeen.has(media)); mediaSeen.add(media);
    const deviceWidth = Number(media.match(/device-width: (\d+)px/)[1]);
    const deviceHeight = Number(media.match(/device-height: (\d+)px/)[1]);
    const ratio = Number(media.match(/device-pixel-ratio: (\d+)/)[1]);
    const landscape = media.includes('orientation: landscape');
    const bytes = readFileSync(new URL(`../public${href}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    assert.equal(width, (landscape ? deviceHeight : deviceWidth) * ratio);
    assert.equal(height, (landscape ? deviceWidth : deviceHeight) * ratio);
    assert.equal(bytes[25], 2, 'opaque RGB without an alpha channel');
    const compressed = [];
    for (let offset = 8; offset < bytes.length;) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + length)), bytes.readUInt32BE(offset + 8 + length));
      if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
      offset += 12 + length;
    }
    const pixels = inflateSync(Buffer.concat(compressed));
    assert.equal(pixels.length, (width * 3 + 1) * height);
    for (const y of [0, Math.floor(height / 2), height - 1]) {
      const row = y * (width * 3 + 1);
      assert.equal(pixels[row], 0);
      for (const x of [0, Math.floor(width / 2), width - 1]) {
        assert.deepEqual([...pixels.subarray(row + 1 + 3 * x, row + 4 + 3 * x)], [248, 253, 252]);
      }
    }
  }
});

test('installed mode is identified in the HTML before React without reading viewport height', () => {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(([, source]) => source.includes("toggleAttribute('data-standalone'"))[1];
  for (const [modern, legacy, expected] of [[true, false, true], [false, true, true], [false, false, false]]) {
    const attributes = new Map();
    const root = { dataset: {}, style: {}, toggleAttribute: (name, value) => value ? attributes.set(name, '') : attributes.delete(name) };
    vm.runInNewContext(script, { document: { documentElement: root }, window: {
      matchMedia: query => ({ matches: query === '(display-mode: standalone)' ? modern : false }),
      navigator: { standalone: legacy }, localStorage: { getItem: () => null }, location: { pathname: '/' },
      get visualViewport() { throw new Error('First paint must not measure VisualViewport'); },
    } });
    assert.equal(attributes.has('data-standalone'), expected);
    assert.equal(root.dataset.appearance, 'light');
  }
});
