import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function compile(path, globals) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, ...globals });
  return exports;
}
const DEVICE_KEY = 'portalinknetworks.deviceAppearanceMode';
const scopedKey = scope => `portalinknetworks.interfaceAppearance.${scope}`;
const saved = (storage, scope = 'web') => JSON.parse(storage.get(scopedKey(scope)));
function harness({ dark = false, legacy = false, storage = new Map(), blockedStorage = false, mediaAvailable = true, server = false } = {}) {
  let cursor = 0;
  const slots = [];
  const mediaListeners = new Set(), windowListeners = new Map(), documentListeners = new Map();
  const media = { matches: dark };
  if (legacy) {
    media.addListener = fn => mediaListeners.add(fn);
    media.removeListener = fn => mediaListeners.delete(fn);
  } else {
    media.addEventListener = (_, fn) => mediaListeners.add(fn);
    media.removeEventListener = (_, fn) => mediaListeners.delete(fn);
  }
  const window = {
    localStorage: {
      getItem(key) { if (blockedStorage) throw Error('Blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blockedStorage) throw Error('Blocked'); storage.set(key, value); },
    },
    matchMedia: mediaAvailable ? () => media : undefined,
    addEventListener: (key, fn) => windowListeners.set(key, fn),
    removeEventListener: key => windowListeners.delete(key),
  };
  const document = { visibilityState: 'visible', addEventListener: (key, fn) => documentListeners.set(key, fn), removeEventListener: key => documentListeners.delete(key) };
  const globals = server ? {} : { window, document };
  const preferences = compile('../src/utils/appearancePreferences.ts', globals);
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useCallback(fn) { return fn; },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!(i in slots) || deps.some((value, n) => value !== slots[i].deps[n])) {
        slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() };
      }
    },
  };
  const { useDeviceAppearance } = compile('../src/hooks/useDeviceAppearance.ts', { ...globals, require: name => name === 'react' ? react : preferences });
  return {
    storage, mediaListeners, windowListeners, documentListeners, document,
    render(scope = 'web') { cursor = 0; return useDeviceAppearance(scope); },
    setDevice(next, notify = true) { media.matches = next; if (notify) mediaListeners.forEach(fn => fn()); },
    dispose() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test('device defaults follow the OS rather than legacy account mode; explicit device overrides remain available', () => {
  for (const dark of [false, true]) {
    const h = harness({ dark, storage: new Map([['portalinknetworks.appearanceMode', dark ? 'light' : 'dark']]) });
    assert.equal(h.render().mode, 'auto');
    assert.equal(h.render().theme, dark ? 'dark' : 'light');
    assert.equal(h.storage.has(DEVICE_KEY), false, 'Reading the device never saves a resolved fixed mode');
    h.render().chooseMode('light');
    assert.equal(h.render().theme, 'light');
    assert.equal(saved(h.storage).mode, 'light');
    h.dispose();
  }
});

test('modern and legacy media listeners follow both directions without replacing System or manual choices', () => {
  for (const legacy of [false, true]) {
    const h = harness({ legacy });
    h.render();
    for (const dark of [true, false, true]) {
      h.setDevice(dark);
      assert.equal(h.render().theme, dark ? 'dark' : 'light');
      assert.equal(h.render().mode, 'auto');
      assert.equal(h.mediaListeners.size, 1);
    }
    h.render().chooseMode('light'); h.setDevice(true);
    assert.equal(h.render().theme, 'light');
    h.render().chooseMode('auto');
    assert.equal(h.render().theme, 'dark');
    assert.equal(saved(h.storage).mode, 'auto');
    h.dispose();
    assert.equal(h.mediaListeners.size + h.windowListeners.size + h.documentListeners.size, 0);
  }
});

test('returning from a suspended app or restored page resynchronizes missed OS changes', () => {
  for (const event of ['pageshow', 'focus', 'visibilitychange']) {
    const h = harness(); h.render();
    h.setDevice(true, false);
    if (event === 'visibilitychange') h.documentListeners.get(event)();
    else h.windowListeners.get(event)();
    assert.equal(h.render().theme, 'dark', event);
    h.setDevice(false, false);
    h.render().chooseMode('auto');
    assert.equal(h.render().theme, 'light');
    h.dispose();
  }
});

test('device overrides survive reloads and sync across tabs; other profile storage cannot override them', () => {
  const storage = new Map([[DEVICE_KEY, 'dark']]);
  const h = harness({ storage });
  assert.equal(h.render().theme, 'dark');
  storage.set(scopedKey('web'), JSON.stringify({ mode: 'auto' })); h.windowListeners.get('storage')({ key: scopedKey('web') });
  assert.equal(h.render().theme, 'light');
  storage.set('portalinknetworks.appearanceMode', 'dark'); h.windowListeners.get('storage')({ key: 'portalinknetworks.appearanceMode' });
  assert.equal(h.render().mode, 'auto');
  h.render().chooseMode('dark');
  h.render();
  assert.equal(harness({ storage }).render().theme, 'dark');
  storage.clear(); h.windowListeners.get('storage')({ key: null });
  assert.equal(h.render().mode, 'auto');
});

test('unavailable storage, missing media APIs and server rendering remain usable', () => {
  const h = harness({ blockedStorage: true, dark: true });
  assert.equal(h.render().theme, 'dark');
  h.render().chooseMode('light'); h.windowListeners.get('focus')();
  assert.equal(h.render().theme, 'light', 'A session-only manual choice survives focus');
  assert.equal(harness({ mediaAvailable: false }).render().theme, 'light');
  assert.equal(harness({ server: true }).render().theme, 'light');
});

test('initial HTML agrees with the device setting and public overrides before React loads', () => {
  const bootstrap = read('../index.html').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  for (const dark of [false, true]) for (const path of ['/', '/share/creator']) {
    const storage = new Map([['portalinknetworks.appearanceMode', dark ? 'light' : 'dark']]);
    const root = { dataset: {}, style: {} };
    const window = { location: { pathname: path }, localStorage: { getItem: key => storage.get(key) ?? null }, matchMedia: query => ({ matches: query.includes('color-scheme') && dark }) };
    vm.runInNewContext(bootstrap, { window, document: { documentElement: root } });
    assert.equal(root.dataset.appearance, dark ? 'dark' : 'light');
    assert.equal(root.style.colorScheme, root.dataset.appearance);
    storage.set(path === '/' ? DEVICE_KEY : 'portalink.publicTheme.creator', 'light');
    vm.runInNewContext(bootstrap, { window, document: { documentElement: root } });
    assert.equal(root.dataset.appearance, 'light');
  }
});

test('all personal appearance choices remain independent through resize, reload and unavailable storage', () => {
  for (const blockedStorage of [false, true]) {
    const h = harness({ blockedStorage, storage: new Map([[DEVICE_KEY, 'dark']]) });
    const originalMobile = h.render('mobile');
    h.render('web').chooseAppearance({ mode: 'light', accentColor: '#FF375F', systemGray: 'gray3', highContrast: true, reduceTranslucency: true });
    h.render('web');
    const mobile = h.render('mobile');
    for (const key of ['mode', 'accentColor', 'systemGray', 'highContrast', 'reduceTranslucency']) assert.equal(mobile[key], originalMobile[key]);
    mobile.chooseAppearance({ mode: 'dark', accentColor: '#30D158', systemGray: 'gray5' });
    h.render('mobile');
    for (let n = 0; n < 3; n++) {
      const web = h.render('web'); assert.equal(web.mode, 'light'); assert.equal(web.accentColor, '#FF375F');
      assert.equal(web.highContrast, true); assert.equal(web.reduceTranslucency, true); assert.equal(web.systemGray, 'gray3');
      assert.equal(h.render('mobile').accentColor, '#30D158');
    }
    if (!blockedStorage) {
      const reloaded = harness({ storage: h.storage });
      assert.equal(reloaded.render('mobile').accentColor, '#30D158');
      assert.equal(reloaded.render('web').accentColor, '#FF375F');
      assert.equal(h.storage.get(DEVICE_KEY), 'dark', 'Legacy settings are never written');
      reloaded.dispose();
    }
    h.dispose();
  }
});

test('cross-tab updates change only their platform slot and never overwrite its sibling', () => {
  const h = harness(); h.render('mobile').chooseMode('light'); h.render('mobile');
  h.storage.set(scopedKey('web'), JSON.stringify({ mode: 'dark', highContrast: true }));
  h.windowListeners.get('storage')({ key: scopedKey('web') });
  assert.equal(h.render('mobile').mode, 'light'); assert.equal(h.render('mobile').highContrast, false);
  assert.equal(h.render('web').mode, 'dark'); assert.equal(h.render('web').highContrast, true);
  h.storage.set(DEVICE_KEY, 'dark'); h.windowListeners.get('storage')({ key: DEVICE_KEY });
  assert.equal(h.render('mobile').mode, 'light'); h.dispose();
});

test('preboot chooses the same platform record and preserves legacy fallback for invalid records', () => {
  const bootstrap = read('../index.html').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  for (const width of [390, 430, 639, 640, 1280]) {
    const scope = width <= 639 ? 'mobile' : 'web';
    const storage = new Map([[DEVICE_KEY, 'dark'], [scopedKey('web'), '{"mode":"light"}'], [scopedKey('mobile'), '{"mode":"dark"}']]);
    const root = { dataset: {}, style: {} };
    const window = { location: { pathname: '/' }, localStorage: { getItem: key => storage.get(key) ?? null }, matchMedia: query => ({ matches: query.includes('639') && width <= 639 }) };
    const run = () => vm.runInNewContext(bootstrap, { window, document: { documentElement: root } });
    run(); assert.equal(root.dataset.appearance, scope === 'web' ? 'light' : 'dark');
    for (const corrupt of ['{broken', '{"mode":"invalid"}']) {
      storage.set(scopedKey(scope), corrupt); run(); assert.equal(root.dataset.appearance, 'dark');
      assert.equal(harness({ storage }).render(scope).mode, 'dark');
    }
    window.location.pathname = '/share/creator';
    storage.set('portalink.publicTheme.creator.web', 'light'); storage.set('portalink.publicTheme.creator.mobile', 'dark');
    run(); assert.equal(root.dataset.appearance, scope === 'web' ? 'light' : 'dark');
  }
});
