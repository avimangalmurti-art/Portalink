import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function style() {
  const values = new Map(), writes = [];
  return { writes,
    getPropertyValue: name => values.get(name)?.value ?? '',
    getPropertyPriority: name => values.get(name)?.priority ?? '',
    get colorScheme() { return values.get('color-scheme')?.value ?? ''; },
    set colorScheme(value) { this.setProperty('color-scheme', value); },
    setProperty(name, value, priority = '') { values.set(name, { value, priority }); writes.push({ name, value, priority }); },
    removeProperty(name) { values.delete(name); writes.push({ name, value: '', priority: '' }); },
  };
}
function events() {
  const listeners = new Map();
  return { listeners,
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { const group = listeners.get(name); group?.delete(callback); if (!group?.size) listeners.delete(name); },
    emit(name) { for (const callback of [...listeners.get(name) ?? []]) callback(); },
  };
}
function harness(withMetadata = true) {
  const tags = [];
  const media = events(), observers = [];
  let welcome = null, inviteSplash = null, projectOpening = null;
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  function meta(attributes = {}) {
    const values = new Map(Object.entries(attributes));
    const tag = { getAttribute: name => values.get(name) ?? null,
      setAttribute: (name, value) => values.set(name, value), removeAttribute: name => values.delete(name),
      remove() { tags.splice(tags.indexOf(tag), 1); } };
    return tag;
  }
  if (withMetadata) tags.push(meta({ content: '#ffffff', media: '(prefers-color-scheme: light)' }),
    meta({ content: '#000000', media: '(prefers-color-scheme: dark)' }));
  const document = { ...events(), visibilityState: 'visible', documentElement: { dataset: {}, style: style() }, body: { style: style() },
    querySelector: selector => selector.includes('data-portalink-invite-splash') ? inviteSplash
      : selector.includes('data-project-opening-loader') ? projectOpening : welcome,
    querySelectorAll: selector => { assert.equal(selector, 'meta[name="theme-color"]:not([data-portalink-launch-theme])'); return tags.filter(tag => tag.getAttribute('data-portalink-launch-theme') === null); },
    createElement: () => meta(), head: { appendChild: tag => tags.push(tag) } };
  const window = { ...events(), matchMedia: () => media }, slots = [], pendingEffects = [], frame = {};
  let token = '#000000', colorScheme = 'dark', cursor = 0;
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useMobileBrowserSurface.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, { exports, document, window, MutationObserver, getComputedStyle: element => {
    if (element === welcome || element === inviteSplash || element === projectOpening) return { backgroundColor: element.color, colorScheme: element.scheme };
    assert.equal(element, frame);
    return { getPropertyValue: name => { assert.equal(name, '--codex-workspace-bg'); return token; }, colorScheme };
  },
    require(name) {
      if (name === 'react') return { useRef: initial => slots[cursor++] ??= { current: initial }, useLayoutEffect: (effect, deps) => {
        const index = cursor++, previous = slots[index];
        if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
          pendingEffects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
        }
      } };
      if (name.endsWith('/splashLifecycle')) return { PORTALINK_SPLASH_EXIT_EVENT: 'portalink:splash-exited' };
      throw new Error(name);
    } });
  return { document, window, tags, media, observers,
    setWelcome(color, scheme = 'dark') { welcome = color ? { color, scheme } : null; },
    setInviteSplash(visible) { inviteSplash = visible ? { color: 'rgb(253, 255, 255)', scheme: 'light' } : null; },
    setProjectOpening(visible) { projectOpening = visible ? { color: 'rgb(0, 0, 0)', scheme: 'dark' } : null; },
    changeWelcome(color, scheme) { welcome.color = color; welcome.scheme = scheme; return welcome; },
    mutate: (records = []) => observers.filter(observer => observer.active).forEach(observer => observer.callback(records)),
    setColor: (color, scheme = color === '#ffffff' ? 'light' : 'dark') => { token = color; colorScheme = scheme; },
    render(presentation, appearance = undefined) {
      cursor = 0;
      exports.useMobileBrowserSurface(presentation, appearance).current = frame;
      pendingEffects.splice(0).forEach(effect => effect());
    }, splashExit: () => window.emit('portalink:splash-exited'), dispose: () => slots.forEach(slot => slot?.cleanup?.()) };
}

test('visible System welcome owns browser colors over a differently themed app and releases them when closed', () => {
  const h = harness();
  h.setColor('#ffffff', 'light');
  h.render('mobile');
  h.setWelcome('rgb(28, 28, 30)', 'dark'); h.mutate();
  assert.equal(h.tags[0].getAttribute('content'), 'rgb(28, 28, 30)');
  assert.equal(h.document.body.style.colorScheme, 'dark');
  h.setColor('#123456', 'dark'); h.render('mobile', {});
  assert.equal(h.tags[0].getAttribute('content'), 'rgb(28, 28, 30)', 'App changes must not repaint over the visible welcome.');
  const writes = h.document.body.style.writes.length;
  h.mutate();
  assert.equal(h.document.body.style.writes.length, writes, 'Ordinary DOM updates do not repaint browser colors.');
  h.setWelcome(null); h.mutate();
  assert.equal(h.tags[0].getAttribute('content'), '#123456');
  assert.equal(h.document.body.style.getPropertyValue('background-color'), '#123456');
  h.dispose();
});

test('an explicit welcome appearance choice immediately updates the browser canvas without an app rerender', () => {
  const h = harness();
  h.setWelcome('rgb(44, 44, 46)', 'dark'); h.render('mobile');
  const target = h.changeWelcome('rgb(255, 255, 255)', 'light');
  h.mutate([{ target, attributeName: 'data-entry-theme' }]);
  assert.equal(h.document.body.style.colorScheme, 'light');
  assert.equal(h.tags[0].getAttribute('content'), 'rgb(255, 255, 255)');
  const writes = h.document.body.style.writes.length;
  h.mutate([{ target, attributeName: 'aria-expanded' }]);
  assert.equal(h.document.body.style.writes.length, writes, 'Opening sections must not repaint the canvas');
  h.dispose();
});

test('the visible invite splash keeps the browser light until the next surface takes over', () => {
  const h = harness();
  h.setInviteSplash(true);
  h.setWelcome('rgb(44, 44, 46)', 'dark');
  h.render('mobile');
  assert.equal(h.document.body.style.colorScheme, 'light');
  assert.ok(h.tags.every(tag => tag.getAttribute('content') === 'rgb(253, 255, 255)'));
  h.setInviteSplash(false);
  h.mutate();
  assert.equal(h.document.body.style.colorScheme, 'dark');
  assert.ok(h.tags.every(tag => tag.getAttribute('content') === 'rgb(44, 44, 46)'));
  h.dispose();
});

test('opening a project uses a black browser canvas until the reader is ready', () => {
  const h = harness();
  h.setColor('#ffffff');
  h.render('mobile');
  h.setProjectOpening(true); h.mutate();
  assert.equal(h.document.body.style.getPropertyValue('background-color'), 'rgb(0, 0, 0)');
  assert.equal(h.tags[0].getAttribute('content'), 'rgb(0, 0, 0)');
  h.setProjectOpening(false); h.mutate();
  assert.equal(h.document.body.style.getPropertyValue('background-color'), '#ffffff');
  assert.equal(h.tags[0].getAttribute('content'), '#ffffff');
  h.dispose();
});

test('live OS changes and foregrounding keep welcome colors current and WEB removes every subscription', () => {
  const h = harness();
  h.setWelcome('rgb(28, 28, 30)', 'dark'); h.render('mobile');
  h.changeWelcome('rgb(242, 242, 247)', 'light'); h.media.emit('change');
  assert.equal(h.document.body.style.colorScheme, 'light');
  assert.equal(h.tags[0].getAttribute('content'), 'rgb(242, 242, 247)');
  h.changeWelcome('rgb(28, 28, 30)', 'dark'); h.window.emit('pageshow');
  assert.equal(h.document.body.style.colorScheme, 'dark');
  assert.equal(h.tags[0].getAttribute('content'), 'rgb(28, 28, 30)');
  h.render('web');
  assert.equal(h.observers.every(observer => !observer.active), true);
  assert.equal(h.media.listeners.size, 0);
  const writes = h.document.body.style.writes.length;
  h.mutate(); h.media.emit('change');
  assert.equal(h.document.body.style.writes.length, writes);
  h.dispose();
});

test('mobile browser chrome follows the actual page surface rather than OS-only metadata', () => {
  const h = harness();
  h.render('mobile', { '--accent': 'pink' });
  for (const tag of h.tags) {
    assert.equal(tag.getAttribute('content'), '#000000');
    assert.match(tag.getAttribute('media'), /prefers-color-scheme/);
  }
  assert.equal(h.document.documentElement.style.getPropertyValue('background-color'), '#000000');
  assert.equal(h.document.body.style.getPropertyValue('background-color'), '#000000');
  assert.equal(h.document.documentElement.style.getPropertyValue('color-scheme'), '', 'App owns the root color scheme.');
  assert.equal(h.document.body.style.getPropertyValue('color-scheme'), 'dark');
  h.setColor('#ffffff');
  h.render('mobile', { '--accent': 'blue' });
  assert.equal(h.tags[0].getAttribute('content'), '#ffffff');
  assert.equal(h.document.body.style.getPropertyValue('background-color'), '#ffffff');
  assert.equal(h.document.body.style.getPropertyValue('color-scheme'), 'light');
  assert.equal(h.window.listeners.size, 3);
  assert.equal(h.document.listeners.size, 1);
  h.dispose();
});

test('live light and dark changes never restore an older document surface between appearances', () => {
  const h = harness();
  for (const element of [h.document.documentElement, h.document.body]) {
    element.style.setProperty('background-color', 'navy', 'important');
    element.style.setProperty('color-scheme', 'light', 'important');
  }
  h.render('mobile', {});
  for (const [color, scheme] of [['#ffffff', 'light'], ['#000000', 'dark'], ['#ffffff', 'light']]) {
    const offsets = [h.document.documentElement, h.document.body].map(element => element.style.writes.length);
    h.setColor(color, scheme);
    h.render('mobile', {});
    for (const [index, element] of [h.document.documentElement, h.document.body].entries()) {
      const changes = element.style.writes.slice(offsets[index]);
      assert.ok(changes.some(change => change.name === 'background-color' && change.value === color));
      assert.equal(changes.some(change => change.name === 'color-scheme' && change.value === scheme), element === h.document.body);
      assert.ok(changes.every(change => change.value === color || change.value === scheme), 'No stale canvas is restored during an appearance update.');
    }
    assert.equal(h.tags[0].getAttribute('content'), color);
    assert.equal(h.window.listeners.size, 3);
    assert.equal(h.document.listeners.size, 1);
  }
  h.dispose();
  assert.equal(h.document.body.style.getPropertyValue('background-color'), 'navy');
  assert.equal(h.document.body.style.getPropertyPriority('background-color'), 'important');
  assert.equal(h.document.body.style.getPropertyValue('color-scheme'), 'light');
  assert.equal(h.document.body.style.getPropertyPriority('color-scheme'), 'important');
});

test('returning to WEB preserves the root appearance already committed by App or Visitor', () => {
  for (const [initial, next] of [['light', 'dark'], ['dark', 'light']]) {
    const h = harness(), root = h.document.documentElement;
    root.dataset.appearance = initial;
    root.style.colorScheme = initial;
    h.setColor(initial === 'dark' ? '#000000' : '#ffffff', initial);
    h.render('mobile', {});

    // App and Visitor own these root writes in their existing theme effects.
    root.dataset.appearance = next;
    root.style.colorScheme = next;
    const rootSchemeWrites = root.style.writes.filter(write => write.name === 'color-scheme').length;
    h.setColor(next === 'dark' ? '#000000' : '#ffffff', next);
    h.render('mobile', {});
    assert.equal(h.document.body.style.colorScheme, next);
    h.render('web', {});

    assert.equal(root.dataset.appearance, next);
    assert.equal(root.style.colorScheme, next, 'The theme effect need not rerun on a presentation-only change.');
    assert.equal(root.style.writes.filter(write => write.name === 'color-scheme').length, rootSchemeWrites,
      'Mobile browser surface never writes or restores the App-owned root scheme.');
    assert.equal(h.document.body.style.colorScheme, '');
    h.dispose();
  }
});

test('startup, restored pages and foregrounding reapply the current frame appearance', () => {
  for (const event of ['portalink:splash-exited', 'pageshow', 'focus', 'visibilitychange']) {
    const h = harness();
    h.render('mobile');
    h.document.body.style.setProperty('background-color', '#f5eaf4');
    h.document.body.style.setProperty('color-scheme', 'dark');
    h.tags[0].setAttribute('content', '#f5eaf4');
    h.setColor('#ffffff', 'light');
    (event === 'visibilitychange' ? h.document : h.window).emit(event);
    assert.equal(h.document.body.style.getPropertyValue('background-color'), '#ffffff', event);
    assert.equal(h.document.body.style.getPropertyValue('color-scheme'), 'light', event);
    assert.equal(h.tags[0].getAttribute('content'), '#ffffff', event);
    h.dispose();
  }
});

test('background visibility events do not repaint until the app is visible', () => {
  const h = harness();
  h.render('mobile');
  h.setColor('#ffffff', 'light');
  h.document.visibilityState = 'hidden';
  h.document.emit('visibilitychange');
  assert.equal(h.document.body.style.getPropertyValue('background-color'), '#000000');
  h.document.visibilityState = 'visible';
  h.document.emit('visibilitychange');
  assert.equal(h.document.body.style.getPropertyValue('background-color'), '#ffffff');
  h.dispose();
});

test('WEB is untouched and switching back restores document styles and metadata exactly', () => {
  const h = harness();
  h.document.body.style.setProperty('background-color', 'navy', 'important');
  h.document.documentElement.style.setProperty('color-scheme', 'light', 'important');
  h.document.body.style.setProperty('color-scheme', 'only light');
  h.render('web');
  assert.equal(h.window.listeners.size, 0);
  assert.equal(h.document.listeners.size, 0);
  assert.equal(h.tags[0].getAttribute('content'), '#ffffff');
  assert.equal(h.document.body.style.getPropertyValue('background-color'), 'navy');
  h.render('mobile');
  h.setColor('#ffffff'); h.render('mobile', {});
  h.render('web');
  assert.equal(h.window.listeners.size, 0);
  assert.equal(h.document.listeners.size, 0);
  assert.equal(h.tags[0].getAttribute('content'), '#ffffff');
  assert.equal(h.tags[0].getAttribute('media'), '(prefers-color-scheme: light)');
  assert.equal(h.tags[1].getAttribute('content'), '#000000');
  assert.equal(h.tags[1].getAttribute('media'), '(prefers-color-scheme: dark)');
  assert.equal(h.document.documentElement.style.getPropertyValue('background-color'), '');
  assert.equal(h.document.body.style.getPropertyValue('background-color'), 'navy');
  assert.equal(h.document.body.style.getPropertyPriority('background-color'), 'important');
  assert.equal(h.document.documentElement.style.getPropertyValue('color-scheme'), 'light');
  assert.equal(h.document.documentElement.style.getPropertyPriority('color-scheme'), 'important');
  assert.equal(h.document.body.style.getPropertyValue('color-scheme'), 'only light');
  assert.equal(h.document.body.style.getPropertyPriority('color-scheme'), '');
  const priorWrites = h.document.body.style.writes.length;
  h.window.emit('focus'); h.window.emit('pageshow'); h.splashExit(); h.document.emit('visibilitychange');
  assert.equal(h.document.body.style.writes.length, priorWrites, 'No stale lifecycle callback repaints WEB.');
});

test('missing metadata is created for mobile then removed on unmount', () => {
  const h = harness(false);
  h.render('mobile');
  assert.equal(h.tags.length, 1);
  assert.equal(h.tags[0].name, 'theme-color');
  h.dispose();
  assert.equal(h.tags.length, 0);
  assert.equal(h.window.listeners.size, 0);
  assert.equal(h.document.listeners.size, 0);
  assert.equal(h.document.documentElement.style.getPropertyValue('color-scheme'), '');
  assert.equal(h.document.body.style.getPropertyValue('color-scheme'), '');
});

test('visitor theme syncing leaves the temporary catalogue splash chrome color white', () => {
  const h = harness();
  h.tags[0].setAttribute('data-portalink-launch-theme', '');
  h.setColor('#141414');
  h.render('mobile');
  assert.deepEqual(h.tags.map(tag => tag.getAttribute('content')), ['#ffffff', '#141414']);
  h.tags[0].remove();
  h.splashExit();
  assert.deepEqual(h.tags.map(tag => tag.getAttribute('content')), ['#141414']);
  h.dispose();
});

test('both launch entries let iOS match the native status bar to the document canvas', () => {
  for (const entry of ['index.html', 'share.html']) {
    const html = readFileSync(new URL(`../${entry}`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /<meta\b[^>]*name="apple-mobile-web-app-status-bar-style"[^>]*>/, entry);
    const viewport = [...html.matchAll(/<meta\b[^>]*name="viewport"[^>]*>/g)];
    assert.equal(viewport.length, 1, entry);
    assert.match(viewport[0][0], /viewport-fit=cover/);
  }
});

test('both launch entries use the viewer’s saved appearance and resolve System against the device', () => {
  for (const entry of ['index.html', 'share.html']) {
    const html = readFileSync(new URL(`../${entry}`, import.meta.url), 'utf8');
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(([, code]) => code.includes('data-portalink-theme-original'))[1];
    for (const mobile of [true, false]) for (const mode of ['light', 'dark', 'auto']) for (const dark of [true, false]) for (const welcomeLink of [true, false]) {
      const tags = ['#ffffff', '#000000'].map(content => {
        const attrs = new Map([['content', content]]);
        return { getAttribute: key => attrs.get(key), setAttribute: (key, value) => attrs.set(key, value) };
      });
      const attributes = new Set();
      const root = {
        dataset: {}, style: {},
        hasAttribute: name => attributes.has(name),
        toggleAttribute: (name, force) => force ? attributes.add(name) : attributes.delete(name),
      };
      vm.runInNewContext(script, { URLSearchParams, document: { documentElement: root, querySelectorAll: () => tags }, window: {
        matchMedia: query => ({ matches: query.includes('639px') ? mobile : query.includes('dark') ? dark : false }),
        location: welcomeLink ? { pathname: '/', search: '?welcome=1' } : { pathname: '/share/fixture', search: '' }, navigator: {},
        localStorage: { getItem: key => key.includes('interfaceAppearance') ? JSON.stringify({ mode }) : null },
      } });
      const resolved = mode === 'auto' ? (dark ? 'dark' : 'light') : mode;
      const invite = entry === 'index.html' && mobile && welcomeLink;
      const color = invite ? '#fdffff' : resolved === 'dark' ? '#000000' : '#ffffff';
      assert.equal(attributes.has('data-invite-launch'), invite);
      assert.deepEqual(tags.map(tag => tag.getAttribute('content')), (mobile || entry === 'share.html') ? [color, color] : ['#ffffff', '#000000']);
      if (mobile || entry === 'share.html') assert.equal(root.dataset.appearance, resolved);
    }
  }
});
