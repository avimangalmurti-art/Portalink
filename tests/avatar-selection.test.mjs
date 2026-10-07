import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, ...globals, require(name) { assert.ok(name in dependencies, `Unexpected import: ${name}`); return dependencies[name]; },
  });
  return exports;
}
const validation = load('../src/features/profile/avatarValidation.ts');
function harness() {
  const slots = [], revoked = [], created = [];
  let cursor = 0, dirty = true, effects = [], selection, failUrl = false;
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, (v) => { const next = typeof v === 'function' ? v(slots[i].value) : v; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; } }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !deps.every((v, k) => Object.is(v, slots[i].deps[k]))) slots[i] = { value: fn, deps }; return slots[i].value; },
    useEffect(effect, deps) { const i = cursor++, prior = slots[i]; if (!prior || !deps.every((v, k) => Object.is(v, prior.deps[k]))) { slots[i] = { deps }; effects.push(() => { prior?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const media = { getUploadCapability: async () => ({ isAvailable: true }) };
  const { useAvatarSelection } = load('../src/features/profile/useProfileOnboarding.ts', {
    react, '../../contexts/ServicesContext': { useServices: () => ({ media }) }, '../../contexts/AuthContext': {}, '../../hooks/useAsyncAction': {},
    './validation': {}, '../../utils/imageMetadata': { readImageDimensions: async () => ({ width: 640, height: 640 }) }, '../auth/registration': {}, './avatarValidation': validation,
  }, { URL: { createObjectURL(file) { if (failUrl) throw Error('Object URL unavailable'); const url = `blob:${created.length}`; created.push({ file, url }); return url; }, revokeObjectURL: (url) => revoked.push(url) } });
  function render() { if (!dirty) return; dirty = false; cursor = 0; effects = []; selection = useAvatarSelection(); effects.forEach((run) => run()); }
  return { created, revoked, get value() { render(); return selection; }, failUrl() { failUrl = true; },
    async flush() { for (let i = 0; i < 10; i++) { render(); await Promise.resolve(); } },
    dispose() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

test('shared source rules preserve accepted MIME types and the existing 4 MB boundary', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
    assert.equal(validation.validateAvatarFile({ type, size: 4 * 1024 * 1024 }), null);
    assert.match(validation.validateAvatarFile({ type, size: 4 * 1024 * 1024 + 1 }), /under 4 MB/);
  }
  assert.match(validation.validateAvatarFile({ type: 'image/svg+xml', size: 1 }), /PNG, JPEG, WebP, or GIF/);
});

test('select returns success only for accepted previews and preserves an earlier photo on invalid replacement', async () => {
  const h = harness(); await h.flush();
  const original = new File(['original'], 'original.png', { type: 'image/png' });
  assert.equal(h.value.select(original), true); await h.flush();
  const before = h.value.avatar;
  assert.equal(h.value.select(new File(['svg'], 'unsafe.svg', { type: 'image/svg+xml' })), false); await h.flush();
  assert.equal(h.value.avatar, before); assert.match(h.value.error, /PNG, JPEG/);
  assert.equal(h.value.select(null), false); assert.equal(h.created.length, 1); assert.equal(h.revoked.length, 0);
  assert.equal(h.value.select({ type: 'image/png', size: 4 * 1024 * 1024 + 1 }), false); assert.match(h.value.error, /4 MB/);
  h.dispose();
});

test('object-URL preparation failure returns false and keeps the prior preview/crop intact', async () => {
  const h = harness(); await h.flush();
  const photo = new File(['pixels'], 'photo.webp', { type: 'image/webp' });
  const framing = { originalSource: 'original.jpg', crop: { x: .2, y: .1, width: .5, height: .5, zoom: 2 } };
  assert.equal(h.value.select(photo, framing), true); await h.flush(); const before = h.value.avatar;
  h.failUrl(); assert.equal(h.value.select(photo, framing), false); await h.flush();
  assert.equal(h.value.avatar, before); assert.equal(h.value.avatar.crop, framing.crop); assert.match(h.value.error, /could not be read/);
  assert.equal(h.revoked.length, 0); h.dispose();
});

test('successful selection clears an earlier error and Undo releases its preview', async () => {
  const h = harness(); await h.flush();
  assert.equal(h.value.select({ type: 'image/other', size: 5 }), false);
  assert.equal(h.value.select(new File(['image'], 'image.jpg', { type: 'image/jpeg' })), true); await h.flush();
  assert.equal(h.value.error, null); const url = h.value.avatar.previewUrl;
  h.value.clear(); assert.equal(h.value.avatar, null); assert.ok(h.revoked.includes(url)); h.dispose();
});
