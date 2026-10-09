import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { visitorSize } from '../scripts/visitor-size-gate.mjs';
test('visitor budget deduplicates static dependencies and includes CSS, excludes lazy chunks', () => {
  const files = [];
  const manifest = { 'share.html': { isEntry: true, file: 'visitor.js', imports: ['react', 'shared'], dynamicImports: ['pdf'], css: ['visitor.css'] }, react: { file: 'react.js' }, shared: { file: 'shared.js', imports: ['react'] } };
  assert.equal(visitorSize(manifest, file => { files.push(file); return Buffer.from(file); }), files.reduce((sum, file) => sum + gzipSync(Buffer.from(file)).length, 0));
  assert.deepEqual(files.sort(), ['react.js', 'shared.js', 'visitor.css', 'visitor.js']);
  assert.throws(() => visitorSize({}, () => ''), /Missing visitor entry/);
});
