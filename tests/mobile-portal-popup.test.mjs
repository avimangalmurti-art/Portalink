import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('portal selection changes the canonical route without marking a new mobile screen', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let selection;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'selectProfileCategory') selection = node.getText(parsed);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  for (const shared of [false, true]) {
    const calls = [];
    const context = { viewedProfileId: 'creator', isSharedRoute: shared,
      nav: { category: (...args) => calls.push(['category', ...args]), sharedCategory: (...args) => calls.push(['share', ...args]) },
      markMobileForwardNavigation() { assert.fail('Portal selection must stay in the existing mobile workspace'); } };
    vm.runInNewContext(ts.transpileModule(`${selection}\nselectProfileCategory('portal');`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    assert.deepEqual(calls, [[shared ? 'share' : 'category', 'creator', 'portal']]);
    context.viewedProfileId = null;
    vm.runInNewContext("selectProfileCategory('another');", context);
    assert.equal(calls.length, 1);
  }
});

test('popup follows the sticky header, retains drill-down size and cleans up all observers', () => {
  let effect, resized, height = 510, headerHeight = 180, headerBottom = 180, disconnected = false;
  const values = new Map(), positions = new Map(), observed = [];
  const events = () => {
    const listeners = new Map();
    return { listeners, addEventListener: (type, listener) => listeners.set(type, listener), removeEventListener: type => listeners.delete(type) };
  };
  const window = { ...events(), visualViewport: events() };
  const header = { getBoundingClientRect: () => ({ height: headerHeight, bottom: headerBottom }) };
  const profile = { current: { querySelector: () => header, style: { setProperty: (name, value) => values.set(name, value) } } };
  const chooser = { getBoundingClientRect: () => ({ height }) };
  const overlay = { current: { querySelector: () => chooser, style: { setProperty: (name, value) => positions.set(name, value) } } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useMobilePortalPopupSize.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, window, require: () => ({ useLayoutEffect: fn => { effect = fn; } }),
    ResizeObserver: class { constructor(fn) { resized = fn; } observe(target) { observed.push(target); } disconnect() { disconnected = true; } } });
  exports.useMobilePortalPopupSize(profile, overlay, true);
  const cleanup = effect();
  assert.equal(values.get('--mobile-portal-popup-height'), '510px');
  assert.equal(positions.get('--mobile-portal-popup-top'), '180px');
  assert.deepEqual(observed, [chooser, header]);
  headerBottom = 300; resized();
  assert.equal(positions.get('--mobile-portal-popup-top'), '300px', 'Expanded header moves chooser below its controls');
  headerBottom = 210; window.listeners.get('scroll')();
  assert.equal(positions.get('--mobile-portal-popup-top'), '210px');
  headerBottom = 190; window.listeners.get('resize')();
  assert.equal(positions.get('--mobile-portal-popup-top'), '190px');
  for (const event of ['resize', 'scroll']) {
    headerBottom -= 10; window.visualViewport.listeners.get(event)();
    assert.equal(positions.get('--mobile-portal-popup-top'), `${headerBottom}px`);
  }
  height = 0; headerHeight = 0; headerBottom = 0; resized();
  assert.equal(values.get('--mobile-portal-popup-height'), '510px');
  assert.equal(positions.get('--mobile-portal-popup-top'), '170px', 'Hidden trees preserve their last visible geometry');
  height = 320; resized();
  assert.equal(values.get('--mobile-portal-popup-height'), '320px');
  cleanup();
  assert.equal(disconnected, true);
  assert.equal(window.listeners.size, 0);
  assert.equal(window.visualViewport.listeners.size, 0);
  exports.useMobilePortalPopupSize(profile, overlay, false);
  effect();
  assert.equal(values.get('--mobile-portal-popup-height'), '320px');
  const otherProfile = { current: { style: { setProperty() { assert.fail('No chooser in the new profile'); } } } };
  exports.useMobilePortalPopupSize(otherProfile, { current: null }, true);
  assert.equal(effect(), undefined);
});
