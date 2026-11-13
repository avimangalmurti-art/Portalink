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
test('public mobile appearance previews and persists without rewriting platform choices', () => {
  const storage = new Map([['portalinknetworks.interfaceAppearance.mobile', JSON.stringify({ mode: 'light', accentColor:'#ff0000' })]]);
  const h = harness({ storage, namespace: 'public' });
  assert.equal(h.render('mobile').theme, 'light');
  h.render('mobile').chooseAppearance({ mode:'dark', accentColor:'#00ff00', highContrast:true });
  assert.equal(h.render('mobile').theme, 'dark');
  assert.equal(JSON.parse(storage.get('portalinknetworks.interfaceAppearance.mobile')).mode, 'light');
  const savedPublic = JSON.parse(storage.get('portalinknetworks.publicAppearance.mobile'));
  assert.equal(savedPublic.mode, 'dark'); assert.equal(savedPublic.highContrast, true);
  const returning = harness({ storage, namespace:'public' });
  assert.equal(returning.render('mobile').accentColor, '#00ff00');
  returning.render('mobile').chooseMode('auto'); returning.setDevice(true);
  assert.equal(returning.render('mobile').theme, 'dark');
});

test('public mobile arrives translucent and respects a saved public accessibility choice', () => {
  const platformKey = 'portalinknetworks.interfaceAppearance.mobile';
  const publicKey = 'portalinknetworks.publicAppearance.mobile';
  const storage = new Map([[platformKey, JSON.stringify({ reduceTranslucency: true, highContrast: true })]]);
  const firstVisit = harness({ storage, namespace: 'public' });
  assert.equal(firstVisit.render('mobile').reduceTranslucency, false);
  assert.equal(firstVisit.render('mobile').highContrast, true);
  firstVisit.render('mobile').chooseAppearance({ reduceTranslucency: true });
  assert.equal(firstVisit.render('mobile').reduceTranslucency, true);
  assert.equal(JSON.parse(storage.get(publicKey)).reduceTranslucency, true);
  assert.equal(JSON.parse(storage.get(platformKey)).reduceTranslucency, true);
  firstVisit.dispose();

  const returning = harness({ storage, namespace: 'public' });
  assert.equal(returning.render('mobile').reduceTranslucency, true);
  returning.dispose();
});
const scopedKey = scope => `portalinknetworks.interfaceAppearance.${scope}`;
const saved = (storage, scope = 'web') => JSON.parse(storage.get(scopedKey(scope)));
function harness({ dark = false, legacy = false, storage = new Map(), blockedStorage = false, mediaAvailable = true, server = false, namespace = 'platform', eventHub } = {}) {
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
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent: event => {
      for (const listener of eventHub?.get(event.type) ?? [windowListeners.get(event.type)].filter(Boolean)) listener(event);
      return true;
    },
    addEventListener(key, fn) {
      windowListeners.set(key, fn);
      if (eventHub) { if (!eventHub.has(key)) eventHub.set(key, new Set()); eventHub.get(key).add(fn); }
    },
    removeEventListener(key, fn) { windowListeners.delete(key); eventHub?.get(key)?.delete(fn); },
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
    render(scope = 'web') { cursor = 0; return useDeviceAppearance(scope, namespace); },
    setDevice(next, notify = true) { media.matches = next; if (notify) mediaListeners.forEach(fn => fn()); },
    dispose() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test('fresh device accents start Pink while saved and legacy colour choices remain intact', () => {
  for (const dark of [false, true]) {
    const h = harness({ dark });
    for (const presentation of ['web', 'mobile']) {
      assert.equal(h.render(presentation).accentColor, '#FF375F');
      assert.equal(h.render(presentation).theme, dark ? 'dark' : 'light');
    }
    h.dispose();
  }
  for (const [entries, web, mobile] of [
    [[['portalinknetworks.accentColor', '#007AFF']], '#007AFF', '#007AFF'],
    [[[scopedKey('mobile'), JSON.stringify({ accentColor: '#0A84FF' })]], '#FF375F', '#0A84FF'],
    [[[scopedKey('web'), JSON.stringify({ accentColor: '#BF5AF2' })]], '#BF5AF2', '#FF375F'],
  ]) {
    const storage = new Map(entries), h = harness({ storage });
    assert.equal(h.render('web').accentColor, web);
    assert.equal(h.render('mobile').accentColor, mobile);
    h.dispose();
    const returning = harness({ storage });
    assert.equal(returning.render('web').accentColor, web);
    assert.equal(returning.render('mobile').accentColor, mobile);
    returning.dispose();
  }
});

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

test('welcome and mounted app share same-document choices without affecting WEB or public preferences', () => {
  for (const blockedStorage of [false, true]) {
    const storage = new Map(), eventHub = new Map();
    const home = harness({ storage, eventHub, blockedStorage });
    const app = harness({ storage, eventHub, blockedStorage });
    const publicView = harness({ storage, eventHub, blockedStorage, namespace: 'public' });
    home.render('mobile'); app.render('mobile'); publicView.render('mobile');
    const originalWeb = JSON.stringify(app.render('web'));
    home.render('mobile').chooseAppearance({ mode: 'dark', accentColor: '#BF5AF2', highContrast: true, reduceTranslucency: true });
    home.render('mobile');
    const resumed = app.render('mobile');
    assert.equal(resumed.mode, 'dark');
    assert.equal(resumed.accentColor, '#BF5AF2');
    assert.equal(resumed.highContrast, true);
    assert.equal(resumed.reduceTranslucency, true);
    assert.equal(JSON.stringify(app.render('web')), originalWeb, 'A mobile home choice must not rewrite WEB');
    assert.equal(publicView.render('mobile').mode, 'auto', 'Public appearance has its own scope');
    app.render('mobile').chooseMode('light'); app.render('mobile');
    assert.equal(home.render('mobile').mode, 'light', 'App choices also update a mounted welcome');
    if (!blockedStorage) assert.equal(harness({ storage }).render('mobile').mode, 'light', 'A new visit retains the choice');
    home.dispose(); app.dispose(); publicView.dispose();
    assert.ok([...eventHub.values()].every(listeners => listeners.size === 0));
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

test('initial HTML uses the device setting on every route and ignores retired public theme overrides', () => {
  const bootstrap = [...read('../index.html').matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].find(([, code]) => code.includes('data-portalink-theme-original'))[1];
  for (const dark of [false, true]) for (const path of ['/', '/share/creator']) {
    const storage = new Map([['portalinknetworks.appearanceMode', dark ? 'light' : 'dark']]);
    const root = { dataset: {}, style: {}, toggleAttribute() {} };
    const window = { navigator: {}, location: { pathname: path }, localStorage: { getItem: key => storage.get(key) ?? null }, matchMedia: query => ({ matches: query.includes('color-scheme') && dark }) };
    vm.runInNewContext(bootstrap, { window, document: { documentElement: root, querySelectorAll: () => [] } });
    assert.equal(root.dataset.appearance, dark ? 'dark' : 'light');
    assert.equal(root.style.colorScheme, root.dataset.appearance);
    storage.set('portalink.publicTheme.creator', dark ? 'light' : 'dark');
    storage.set('portalink.publicTheme.creator.web', dark ? 'light' : 'dark');
    vm.runInNewContext(bootstrap, { window, document: { documentElement: root, querySelectorAll: () => [] } });
    assert.equal(root.dataset.appearance, dark ? 'dark' : 'light');
    storage.set(DEVICE_KEY, 'light');
    vm.runInNewContext(bootstrap, { window, document: { documentElement: root, querySelectorAll: () => [] } });
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
  const bootstrap = [...read('../index.html').matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].find(([, code]) => code.includes('data-portalink-theme-original'))[1];
  for (const width of [390, 430, 639, 640, 1280]) {
    const scope = width <= 639 ? 'mobile' : 'web';
    const storage = new Map([[DEVICE_KEY, 'dark'], [scopedKey('web'), '{"mode":"light"}'], [scopedKey('mobile'), '{"mode":"dark"}']]);
    const attributes = new Set();
    const root = {
      dataset: {}, style: {},
      hasAttribute: name => attributes.has(name),
      toggleAttribute: (name, force) => force ? attributes.add(name) : attributes.delete(name),
    };
    const window = { navigator: {}, location: { pathname: '/' }, localStorage: { getItem: key => storage.get(key) ?? null }, matchMedia: query => ({ matches: query.includes('639') && width <= 639 }) };
    const run = () => vm.runInNewContext(bootstrap, { URLSearchParams, window, document: { documentElement: root, querySelectorAll: () => [] } });
    run(); assert.equal(root.dataset.appearance, scope === 'web' ? 'light' : 'dark');
    for (const corrupt of ['{broken', '{"mode":"invalid"}']) {
      storage.set(scopedKey(scope), corrupt); run(); assert.equal(root.dataset.appearance, 'dark');
      assert.equal(harness({ storage }).render(scope).mode, 'dark');
    }
    window.location.pathname = '/share/creator';
    storage.set(scopedKey(scope), JSON.stringify({ mode: scope === 'web' ? 'light' : 'dark' }));
    storage.set('portalink.publicTheme.creator.web', 'dark'); storage.set('portalink.publicTheme.creator.mobile', 'light');
    run(); assert.equal(root.dataset.appearance, scope === 'web' ? 'light' : 'dark');
  }
});

test('shared catalogue preboot matches the platform mode and system color on either presentation', () => {
  const bootstrap = [...read('../share.html').matchAll(/<script>\s*([\s\S]*?)<\/script>/g)]
    .find(([, code]) => code.includes('data-portalink-theme-original'))[1];
  for (const [width, scope] of [[639, 'mobile'], [640, 'web']]) {
    for (const [mode, dark, expected] of [['light', true, 'light'], ['dark', false, 'dark'], ['auto', true, 'dark'], ['auto', false, 'light'], [null, false, 'dark']]) {
      const storage = new Map([
        [DEVICE_KEY, 'dark'],
        [scopedKey(scope), mode ? JSON.stringify({ mode }) : '{broken'],
        [scopedKey(scope === 'mobile' ? 'web' : 'mobile'), JSON.stringify({ mode: expected === 'dark' ? 'light' : 'dark' })],
        ['portalinknetworks.publicAppearance.mobile', JSON.stringify({ mode: expected === 'dark' ? 'light' : 'dark' })],
      ]);
      const root = { dataset: {}, style: {} };
      const meta = new Map([['content', '#123456']]);
      const window = {
        location: { pathname: '/portalite' },
        localStorage: { getItem: key => storage.get(key) ?? null },
        matchMedia: query => ({ matches: query.includes('639') ? width <= 639 : dark }),
      };
      const document = { documentElement: root, querySelectorAll: () => [{ getAttribute: key => meta.get(key), setAttribute: (key, value) => meta.set(key, value) }] };
      vm.runInNewContext(bootstrap, { window, document });
      const platform = harness({ dark, storage });
      assert.equal(root.dataset.appearance, expected);
      assert.equal(root.style.colorScheme, platform.render(scope).theme);
      assert.equal(meta.get('content'), expected === 'dark' ? '#000000' : '#ffffff');
      platform.dispose();
    }
  }
});

// Evaluate the shell's actual appearance expressions with the real preference
// hook and token resolvers, without mocking the rest of the routed application.
const appSource = read('../src/App.tsx');
const appAst = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function appNode(predicate) {
  let result;
  const visit = node => { if (result) return; if (predicate(node)) result = node; else ts.forEachChild(node, visit); };
  visit(appAst);
  assert.ok(result, 'Expected application appearance expression');
  return result;
}
const appInitializer = name => appNode(node => ts.isVariableDeclaration(node) && node.name.getText(appAst) === name).initializer.getText(appAst);
const interfaceNames = ['interfaceTheme', 'interfaceHighContrast', 'interfaceReduceTranslucency', 'interfaceNavSystemGray', 'interfaceAccentColor'];
const shellClass = appNode(node => ts.isJsxOpeningElement(node) && node.tagName.getText(appAst) === 'AppPresentation')
  .attributes.properties.find(node => node.name?.getText(appAst) === 'className').initializer.expression.getText(appAst);
const shellAppearanceCode = ts.transpileModule(`
  ${interfaceNames.map(name => `const ${name} = ${appInitializer(name)};`).join('\n')}
  result = { style: ${appInitializer('rootTokenStyle')}, className: ${shellClass}, theme: interfaceTheme };
`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const tokenResolvers = {
  ...compile('../src/data/navButtonTokens.ts', {}),
  ...compile('../src/utils/accentTokens.ts', {}),
  ...compile('../src/utils/macTokens.ts', {}),
};
function shellAppearance(appearance, kind) {
  const context = { ...tokenResolvers, ...appearance, navSystemGray: appearance.systemGray,
    isSharedRoute: kind.startsWith('shared'), route: { kind, profileId: 'creator' },
    // Deliberately disagree with every viewer preference to catch route leaks.
    publicAppearance: { accentColor: '#0A84FF', systemGray: 'gray6', mode: 'light' },
    visitorTheme: appearance.theme === 'dark' ? 'light' : 'dark',
    resolvePublicTheme: visitorTheme => visitorTheme,
    useMemo: fn => fn(), getTypefaceStack: () => 'interface font', result: null,
  };
  vm.runInNewContext(shellAppearanceCode, context);
  return JSON.parse(JSON.stringify(context.result));
}

test('Home, profile, project and shared shell appearance follows active Settings in Light, Dark and System', () => {
  const h = harness();
  for (const scope of ['mobile', 'web']) for (const mode of ['light', 'dark', 'auto']) {
    h.render(scope).chooseAppearance({ mode, accentColor: '#FF375F', systemGray: 'gray3', highContrast: true, reduceTranslucency: true });
    for (const dark of [false, true]) {
      h.setDevice(dark);
      const appearance = h.render(scope);
      const baseline = shellAppearance(appearance, 'home');
      assert.equal(baseline.theme, mode === 'auto' ? (dark ? 'dark' : 'light') : mode);
      assert.equal(baseline.style['--accent-color'], '#FF375F');
      assert.equal(baseline.style['--control-rest-surface'], tokenResolvers.systemGrays.find(gray => gray.id === 'gray3')[baseline.theme]);
      for (const route of ['profile', 'project', 'sharedProfile', 'sharedCategory', 'sharedProject']) {
        const actual = shellAppearance(appearance, route);
        assert.deepEqual(actual.style, baseline.style, `${scope}/${mode}/${route}`);
        assert.equal(actual.theme, baseline.theme);
        assert.ok(actual.className.includes(`theme-${baseline.theme}`));
        assert.ok(actual.className.includes('high-contrast'));
        assert.ok(actual.className.includes('reduce-translucency'));
      }
    }
  }
  h.dispose();
});

test('shared navigation theme action updates active Settings only, leaving creator and legacy visitor preferences intact', () => {
  const storage = new Map([['portalink.publicTheme.creator.mobile', 'dark'], ['portalink.publicTheme.creator', 'dark']]);
  const h = harness({ storage });
  h.render('web').chooseMode('dark'); h.render('web');
  const creator = Object.freeze({ accentColor: '#FF375F', systemGray: 'gray4', mode: 'dark' });
  const sharedSidebar = appNode(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(appAst) === 'SharedProfileSidebar');
  const callback = sharedSidebar.attributes.properties.find(node => node.name?.getText(appAst) === 'onThemeChange').initializer.expression.getText(appAst);
  const chooseTheme = appNode(node => ts.isFunctionDeclaration(node) && node.name?.text === 'chooseTheme').getText(appAst);
  const context = { setAppearanceMode: h.render('mobile').chooseMode, publicAppearance: creator, result: null };
  vm.runInNewContext(ts.transpileModule(`${chooseTheme}\nresult = ${callback};`, {}).outputText, context);
  context.result('light');
  assert.equal(h.render('mobile').mode, 'light');
  assert.equal(h.render('web').mode, 'dark');
  assert.equal(saved(storage, 'mobile').mode, 'light');
  assert.equal(saved(storage, 'web').mode, 'dark');
  assert.equal(storage.get('portalink.publicTheme.creator.mobile'), 'dark');
  assert.equal(storage.get('portalink.publicTheme.creator'), 'dark');
  assert.deepEqual(creator, { accentColor: '#FF375F', systemGray: 'gray4', mode: 'dark' });
  h.dispose();
});
