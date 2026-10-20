import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
import { hookHarness, deferred } from './helpers/hook-harness.mjs';

function events() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    emit(type, event = {}) { for (const handler of [...listeners.get(type) ?? []]) handler(event); },
    count() { return [...listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0); },
    handlers(type) { return [...listeners.get(type) ?? []]; },
  };
}
function fixture({ userAgent = 'Mozilla/5.0 (Linux; Android 16) Chrome/145 Safari/537.36', platform = 'Linux', maxTouchPoints = 5, standalone = false, mode, matchMedia = true, legacyMedia = false } = {}) {
  const window = events(), navigator = { userAgent, platform, maxTouchPoints, standalone }, modes = new Map();
  let reads = 0;
  if (matchMedia) window.matchMedia = query => {
    if (!modes.has(query)) {
      const target = events(), item = { ...target, matches: query === `(display-mode: ${mode})` };
      if (legacyMedia) {
        item.addListener = callback => target.addEventListener('change', callback);
        item.removeListener = callback => target.removeEventListener('change', callback);
        delete item.addEventListener; delete item.removeEventListener;
      }
      modes.set(query, item);
    }
    return modes.get(query);
  };
  const { createMobileInstallStore } = sourceModule('src/features/install/installState.ts');
  const store = createMobileInstallStore(() => { reads += 1; return { window, navigator }; });
  const installEvent = ({ prompt = () => Promise.resolve(), choice = Promise.resolve({ outcome: 'accepted' }) } = {}) => {
    let calls = 0, prevented = 0;
    const event = { prompt() { calls += 1; return prompt(); }, userChoice: choice, preventDefault() { prevented += 1; } };
    window.emit('beforeinstallprompt', event);
    return { event, get calls() { return calls; }, get prevented() { return prevented; } };
  };
  return { store, window, navigator, modes, installEvent, get reads() { return reads; },
    get listenerCount() { return window.count() + [...modes.values()].reduce((sum, item) => sum + item.count(), 0); },
    mode(value) { const query = modes.get('(display-mode: standalone)'); query.matches = value; query.emit('change'); },
  };
}
const flush = async () => { for (let count = 0; count < 8; count++) await Promise.resolve(); };

test('loading the module and subscribing do not read browser state, install listeners or open a prompt', () => {
  const f = fixture(), unsubscribe = f.store.subscribe(() => undefined);
  assert.equal(f.reads, 0); assert.equal(f.listenerCount, 0);
  f.store.requestInstall(); assert.equal(f.reads, 0);
  const release = f.store.capture(), event = f.installEvent();
  assert.equal(f.reads, 1); assert.equal(event.prevented, 1); assert.equal(event.calls, 0);
  assert.equal(f.store.getSnapshot().canPrompt, true);
  unsubscribe(); release(); assert.equal(f.listenerCount, 0);
});

test('instruction selection recognizes iPhone, desktop-UA iPad, other iOS browsers and Android independently of presentation', () => {
  for (const [options, expected] of [
    [{ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit Version/27.0 Mobile Safari/605.1' }, 'ios-safari'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit Version/27.0 Safari/605.1', platform: 'MacIntel', maxTouchPoints: 5 }, 'ios-safari'],
    [{ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit CriOS/145 Mobile Safari/605.1' }, 'ios-other'],
    [{ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit FxiOS/145 Mobile Safari/605.1' }, 'ios-other'],
    [{}, 'android'],
    [{ userAgent: 'Unknown browser', maxTouchPoints: 0 }, 'other'],
  ]) {
    const f = fixture(options), release = f.store.capture();
    assert.equal(f.store.getSnapshot().platform, expected); release();
  }
});

test('legacy iOS and each installed display mode suppress a deferred prompt', () => {
  for (const options of [{ standalone: true }, ...['standalone', 'fullscreen', 'minimal-ui'].map(mode => ({ mode }))]) {
    const f = fixture(options), release = f.store.capture(), event = f.installEvent();
    assert.equal(f.store.getSnapshot().standalone, true); assert.equal(f.store.getSnapshot().canPrompt, false);
    f.store.requestInstall(); assert.equal(event.calls, 0); release();
  }
});

test('a prompt captured before Settings opens is retained and called synchronously once on deliberate request', async () => {
  const f = fixture(), release = f.store.capture(), shown = deferred(), choice = deferred(), order = [];
  const event = f.installEvent({ prompt: () => { order.push('native-prompt'); return shown.promise; }, choice: choice.promise });
  const subscribed = []; const unsubscribe = f.store.subscribe(() => subscribed.push(f.store.getSnapshot()));
  assert.equal(f.store.getSnapshot().canPrompt, true);
  f.store.requestInstall(); order.push('after-tap'); f.store.requestInstall();
  assert.deepEqual(order, ['native-prompt', 'after-tap']); assert.equal(event.calls, 1);
  assert.equal(f.store.getSnapshot().status, 'prompting'); assert.equal(f.store.getSnapshot().canPrompt, false);
  choice.resolve({ outcome: 'accepted' }); await flush(); assert.equal(f.store.getSnapshot().status, 'prompting');
  shown.resolve(); await flush(); assert.equal(f.store.getSnapshot().status, 'accepted');
  assert.equal(f.store.getSnapshot().standalone, false, 'Accepted is not proof of completed installation');
  f.window.emit('appinstalled'); assert.equal(f.store.getSnapshot().standalone, true);
  assert.ok(subscribed.length >= 3); unsubscribe(); release();
});

test('dismissal consumes the one-shot event, stays manual, and a fresh browser event can enable another request', async () => {
  const f = fixture(), release = f.store.capture(), first = f.installEvent({ choice: Promise.resolve({ outcome: 'dismissed' }) });
  f.store.requestInstall(); await flush();
  assert.equal(f.store.getSnapshot().status, 'dismissed'); assert.equal(f.store.getSnapshot().canPrompt, false);
  f.store.requestInstall(); assert.equal(first.calls, 1);
  const next = f.installEvent(); assert.equal(next.calls, 0); assert.equal(f.store.getSnapshot().status, 'idle');
  assert.equal(f.store.getSnapshot().canPrompt, true); release();
});

test('synchronous failure and rejection both fall back without automatic retry', async () => {
  for (const throws of [true, false]) {
    const f = fixture(), release = f.store.capture(), event = f.installEvent({ prompt: () => {
      if (throws) throw new Error('Not allowed'); return Promise.reject(new Error('Not available'));
    } });
    f.store.requestInstall(); await flush();
    assert.equal(f.store.getSnapshot().status, 'failed'); assert.equal(f.store.getSnapshot().canPrompt, false);
    f.store.requestInstall(); assert.equal(event.calls, 1); release();
  }
});

test('installation and display-mode changes hide guidance immediately and ignore late prompt results', async () => {
  for (const install of ['appinstalled', 'mode']) {
    const f = fixture(), release = f.store.capture(), choice = deferred();
    f.installEvent({ choice: choice.promise }); f.store.requestInstall();
    if (install === 'mode') f.mode(true); else f.window.emit('appinstalled');
    assert.equal(f.store.getSnapshot().standalone, true); assert.equal(f.store.getSnapshot().status, 'idle');
    choice.resolve({ outcome: 'dismissed' }); await flush();
    assert.equal(f.store.getSnapshot().standalone, true); assert.equal(f.store.getSnapshot().status, 'idle'); release();
  }
});

test('ref-counted capture cleans listeners once; stale callbacks and pending results cannot revive a released store', async () => {
  const f = fixture(), release = f.store.capture(), second = f.store.capture(), choice = deferred();
  const staleInstalled = f.window.handlers('appinstalled')[0], staleMode = f.modes.get('(display-mode: standalone)').handlers('change')[0];
  f.installEvent({ choice: choice.promise }); f.store.requestInstall();
  const count = f.listenerCount; release(); release(); assert.equal(f.listenerCount, count);
  second(); assert.equal(f.listenerCount, 0); assert.equal(f.store.getSnapshot().status, 'idle');
  staleInstalled(); staleMode(); choice.resolve({ outcome: 'accepted' }); await flush();
  assert.equal(f.store.getSnapshot().standalone, false); assert.equal(f.store.getSnapshot().canPrompt, false);
  const recapture = f.store.capture(); assert.equal(f.reads, 2); assert.equal(f.store.getSnapshot().status, 'idle'); recapture();
});

test('without matchMedia, manual guidance remains usable and pageshow rechecks legacy standalone', () => {
  const f = fixture({ matchMedia: false }), release = f.store.capture();
  assert.equal(f.store.getSnapshot().standalone, false); assert.equal(f.store.getSnapshot().canPrompt, false);
  f.navigator.standalone = true; f.window.emit('pageshow'); assert.equal(f.store.getSnapshot().standalone, true); release();
});

test('older MediaQueryList listeners still update standalone state and release cleanly', () => {
  const f = fixture({ legacyMedia: true }), release = f.store.capture();
  assert.equal(f.store.getSnapshot().standalone, false);
  f.mode(true); assert.equal(f.store.getSnapshot().standalone, true);
  release(); assert.equal(f.listenerCount, 0);
});

test('stable snapshots do not notify subscribers without a capability change; unsubscribe removes observers', () => {
  const f = fixture(), release = f.store.capture(); let changes = 0;
  const unsubscribe = f.store.subscribe(() => changes++), snapshot = f.store.getSnapshot();
  f.window.emit('pageshow'); assert.equal(f.store.getSnapshot(), snapshot); assert.equal(changes, 0);
  f.installEvent(); assert.equal(changes, 1); unsubscribe(); f.window.emit('appinstalled'); assert.equal(changes, 1); release();
});

test('the root capture hook installs nothing in WEB and releases its ownership on presentation change and unmount', async () => {
  let captures = 0, releases = 0;
  const h = hookHarness(new URL('../src/features/install/useMobileInstall.ts', import.meta.url), 'useMobileInstallCapture', {}, {}, [false], undefined, {
    './installState': { mobileInstallStore: { capture() { captures++; return () => releases++; } } },
  });
  await h.flush(); assert.equal(captures, 0);
  h.options([true]); await h.flush(); assert.equal(captures, 1);
  h.rerender(); await h.flush(); assert.equal(captures, 1);
  h.options([false]); await h.flush(); assert.equal(releases, 1);
  h.options([true]); await h.flush(); h.dispose(); assert.equal(captures, 2); assert.equal(releases, 2);
});

const all = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(all)] : [];
const text = tree => React.Children.toArray(tree).map(item => React.isValidElement(item) ? text(item.props.children) : String(item)).join(' ');
function guidance(initial = {}) {
  let install = { standalone: false, platform: 'android', canPrompt: false, status: 'idle', ...initial }, expanded = false, prompts = 0;
  const focus = [], trigger = { current: { focus: value => focus.push(value) } };
  const { MobileHomeScreenInstall } = sourceModule('src/features/install/MobileHomeScreenInstall.tsx', {
    react: { useId: () => 'install-instructions', useRef: () => trigger, useState: () => [expanded, value => { expanded = typeof value === 'function' ? value(expanded) : value; }] },
    '../../components/ui/Button': { Button: 'button' }, './installState': { mobileInstallStore: { requestInstall: () => prompts++ } },
    './useMobileInstall': { useMobileInstallState: () => install },
  }, { React });
  return { render: () => MobileHomeScreenInstall(), set: value => { install = { ...install, ...value }; }, focus, get prompts() { return prompts; },
    click(label) { const button = all(MobileHomeScreenInstall()).find(item => item.type === 'button' && text(item.props.children).includes(label)); assert.ok(button, label); button.props.onClick(); },
  };
}

test('guidance is an opt-in accessible disclosure, and Done restores focus to its existing Settings action', () => {
  const g = guidance(); let tree = g.render();
  assert.equal(all(tree).find(item => item.type === 'button').props['aria-expanded'], false);
  assert.equal(all(tree).some(item => item.type === 'ol'), false); assert.equal(g.prompts, 0);
  g.click('Add to Home Screen'); tree = g.render();
  const button = all(tree).find(item => item.type === 'button'), instructions = all(tree).find(item => item.props.id === button.props['aria-controls']);
  assert.ok(instructions); assert.equal(button.props['aria-expanded'], true); assert.match(text(tree), /browser menu/);
  assert.equal(g.prompts, 0); g.click('Done'); assert.equal(all(g.render()).some(item => item.type === 'ol'), false);
  assert.equal(g.focus.length, 1); assert.equal(g.focus[0].preventScroll, true);
});

test('iPhone and iPad Safari instructions include Share, Add to Home Screen and conditional Open as Web App', () => {
  for (const platform of ['ios-safari', 'ios-other']) {
    const g = guidance({ platform }); g.click('Add to Home Screen'); const content = text(g.render());
    assert.match(content, /Tap Share in Safari/); assert.match(content, /Choose Add to Home Screen/);
    assert.match(content, /Open as Web App on if shown/);
    assert.equal(content.includes('Open portalinknetworks.com in Safari'), platform === 'ios-other');
  }
});

test('only the explicit Install action invokes the native prompt; cancellation and failure retain manual instructions', () => {
  const g = guidance({ canPrompt: true }); g.click('Add to Home Screen'); assert.equal(g.prompts, 0);
  g.click('Install Portalink'); assert.equal(g.prompts, 1);
  for (const status of ['dismissed', 'failed', 'accepted']) {
    g.set({ status, canPrompt: false }); const tree = g.render();
    assert.ok(all(tree).some(item => item.props.role === 'status')); assert.match(text(tree), /browser menu/);
    assert.equal(all(tree).some(item => item.type === 'button' && text(item.props.children) === 'Install Portalink'), false);
  }
});

test('standalone guidance is entirely absent even when the disclosure was open', () => {
  const g = guidance(); g.click('Add to Home Screen'); assert.ok(g.render());
  g.set({ standalone: true }); assert.equal(g.render(), null);
});
