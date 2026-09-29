import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/utils/appearancePreferences.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
function preference(stored = null, unavailable = false) {
  const data = new Map();
  if (stored !== null) data.set('portalinknetworks.studioView.mobile', stored);
  data.set('portalinknetworks.interfaceAppearance.web', '{"mode":"light"}');
  const exports = {};
  vm.runInNewContext(source, { exports, window: { localStorage: {
    getItem(key) { if (unavailable) throw Error('Storage unavailable'); return data.get(key) ?? null; },
    setItem(key, value) { if (unavailable) throw Error('Storage unavailable'); data.set(key, value); },
  } } });
  return { ...exports, data };
}

test('Studio defaults to categories and accepts only its two known stored view choices', () => {
  for (const value of [null, 'categories', 'unknown', 'LIST', '{}']) assert.equal(preference(value).readStudioView(), 'categories');
  assert.equal(preference('list').readStudioView(), 'list');
});

test('Studio view persists in its MOBILE preference without modifying WEB or other appearance settings', () => {
  const h = preference();
  h.writeStudioView('list');
  assert.equal(h.readStudioView(), 'list');
  h.writeStudioView('categories');
  assert.equal(h.readStudioView(), 'categories');
  assert.deepEqual([...h.data], [
    ['portalinknetworks.interfaceAppearance.web', '{"mode":"light"}'],
    ['portalinknetworks.studioView.mobile', 'categories'],
  ]);
});

test('unavailable storage keeps the Studio view menu usable', () => {
  const h = preference(null, true);
  assert.equal(h.readStudioView(), 'categories');
  assert.doesNotThrow(() => h.writeStudioView('list'));
  const exports = {};
  vm.runInNewContext(source, { exports });
  assert.equal(exports.readStudioView(), 'categories');
  assert.doesNotThrow(() => exports.writeStudioView('categories'));
});
