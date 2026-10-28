import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync, crc32 } from 'node:zlib';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const canvas = [253, 255, 255];

function decodePng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8, '8-bit channels');
  assert.equal(bytes[25], 2, 'opaque RGB without an alpha channel');
  assert.equal(bytes[28], 0, 'non-interlaced PNG');
  const compressed = [];
  let ended = false;
  for (let offset = 8; offset < bytes.length;) {
    assert.ok(offset + 12 <= bytes.length);
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    assert.ok(offset + 12 + length <= bytes.length);
    assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + length)), bytes.readUInt32BE(offset + 8 + length), `${type} CRC`);
    if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === 'IEND') { assert.equal(length, 0); assert.equal(offset, bytes.length); ended = true; }
  }
  assert.equal(ended, true);
  assert.ok(compressed.length > 0);
  const filtered = inflateSync(Buffer.concat(compressed)), stride = width * 3;
  assert.equal(filtered.length, (stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)], source = y * (stride + 1) + 1, row = y * stride;
    assert.ok(filter <= 4, 'valid PNG row filter');
    if (filter === 0) { filtered.copy(pixels, row, source, source + stride); continue; }
    for (let x = 0; x < stride; x++) {
      const left = x >= 3 ? pixels[row + x - 3] : 0, up = y > 0 ? pixels[row + x - stride] : 0, upperLeft = x >= 3 && y > 0 ? pixels[row + x - stride - 3] : 0;
      let prediction = 0;
      if (filter === 1) prediction = left;
      else if (filter === 2) prediction = up;
      else if (filter === 3) prediction = Math.floor((left + up) / 2);
      else {
        const estimate = left + up - upperLeft, a = Math.abs(estimate - left), b = Math.abs(estimate - up), c = Math.abs(estimate - upperLeft);
        prediction = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      }
      pixels[row + x] = (filtered[source + x] + prediction) & 255;
    }
  }
  return { width, height, pixels };
}
function pixel(image, x, y) {
  const offset = (y * image.width + x) * 3;
  return [...image.pixels.subarray(offset, offset + 3)];
}
function inkBounds(image) {
  let left = image.width, right = -1, top = image.height, bottom = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const offset = (y * image.width + x) * 3;
    if (Math.min(image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]) >= 100) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  assert.ok(right >= left && bottom >= top, 'real first-frame artwork exists');
  return { left, right, top, bottom };
}
const poster = decodePng(readFileSync(new URL('../public/portalink-splash-poster.png', import.meta.url)));
const sourceInk = inkBounds(poster);
const sourceSamples = [];
for (let y = 3; y < poster.height - 3; y += 4) for (let x = 3; x < poster.width - 3; x += 4) {
  const colour = pixel(poster, x, y);
  if (Math.min(...colour) >= 100) continue;
  let stable = true;
  for (let dy = -3; dy <= 3 && stable; dy++) for (let dx = -3; dx <= 3 && stable; dx++) {
    stable = pixel(poster, x + dx, y + dy).every((value, channel) => Math.abs(value - colour[channel]) <= 2);
  }
  if (stable) sourceSamples.push({ x, y, colour });
}
assert.ok(sourceSamples.length >= 100, 'source artwork provides enough stable ink/colour samples');

test('every Apple startup class has an opaque, CRC-valid device-sized first frame centered without distortion', () => {
  const links = [...html.matchAll(/<link rel="apple-touch-startup-image" href="([^"]+)" media="([^"]+)"/g)];
  assert.equal(links.length, 28);
  assert.ok(links.some(([, , media]) => media.includes('device-width: 420px') && media.includes('device-height: 912px') && media.includes('orientation: portrait')));
  const mediaSeen = new Set(), assets = new Set();
  for (const [, href, media] of links) {
    assert.ok(!mediaSeen.has(media)); mediaSeen.add(media);
    const deviceWidth = Number(media.match(/device-width: (\d+)px/)[1]);
    const deviceHeight = Number(media.match(/device-height: (\d+)px/)[1]);
    const ratio = Number(media.match(/device-pixel-ratio: (\d+)/)[1]);
    const landscape = media.includes('orientation: landscape');
    const address = new URL(href, 'https://portalink.test'), filename = address.pathname.split('/').at(-1);
    assets.add(filename);
    const bytes = readFileSync(new URL(`../public${address.pathname}`, import.meta.url));
    const revision = address.searchParams.get('v');
    if (revision) assert.equal(revision, createHash('sha256').update(bytes).digest('hex').slice(0, 12), 'cache revision matches the delivered asset');
    const image = decodePng(bytes), { width, height } = image;
    assert.equal(width, (landscape ? deviceHeight : deviceWidth) * ratio);
    assert.equal(height, (landscape ? deviceWidth : deviceHeight) * ratio);
    for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) assert.deepEqual(pixel(image, x, y), canvas, 'opaque #fdffff canvas');
    const scale = Math.min(width / poster.width, height / poster.height), artWidth = Math.round(poster.width * scale), artHeight = Math.round(poster.height * scale);
    const left = Math.floor((width - artWidth) / 2), top = Math.floor((height - artHeight) / 2), scaleX = artWidth / poster.width, scaleY = artHeight / poster.height;
    const ink = inkBounds(image), tolerance = Math.ceil(scale * 2) + 2;
    for (const [edge, expected] of Object.entries({ left: left + sourceInk.left * scaleX, right: left + sourceInk.right * scaleX, top: top + sourceInk.top * scaleY, bottom: top + sourceInk.bottom * scaleY })) {
      assert.ok(Math.abs(ink[edge] - expected) <= tolerance, `${filename}: source ${edge} stays at its centered contain position`);
    }
    let matches = 0;
    for (const sample of sourceSamples) {
      const actual = pixel(image, left + Math.round((sample.x + 0.5) * scaleX - 0.5), top + Math.round((sample.y + 0.5) * scaleY - 0.5));
      if (actual.every((value, channel) => Math.abs(value - sample.colour[channel]) <= 20)) matches++;
    }
    assert.ok(matches >= sourceSamples.length * 0.98, `${filename}: first-frame ink and globe colours match the unchanged poster`);
  }
  assert.deepEqual([...assets].sort(), readdirSync(new URL('../public/startup/', import.meta.url)).filter(name => name.endsWith('.png')).sort());
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
