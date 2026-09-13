import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import postcss from 'postcss';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
function compile(path, globals) {
  const exports = {};
  const code = ts.transpileModule(read(path), { compilerOptions: {
    jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { exports, ...globals });
  return exports;
}

function viewportHarness(width, available = true) {
  let cursor = 0, effects = [], queryCalls = 0;
  const slots = [], listeners = new Set();
  const media = {
    matches: width <= 639,
    addEventListener(name, listener) { assert.equal(name, 'change'); listeners.add(listener); },
    removeEventListener(name, listener) { assert.equal(name, 'change'); listeners.delete(listener); },
  };
  const react = {
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (value) => { slots[i].value = value; }];
    },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, n) => dep !== slots[i].deps[n])) {
        slots[i]?.cleanup?.(); slots[i] = { deps };
        effects.push(() => { slots[i].cleanup = effect(); });
      }
    },
  };
  const globals = { require: (name) => { assert.equal(name, 'react'); return react; } };
  if (available === true) globals.window = { matchMedia(query) {
    assert.equal(query, '(max-width: 639px)'); queryCalls++; return media;
  } };
  if (available === 'no-match-media') globals.window = {};
  const { useViewportPresentation } = compile('../src/presentation/useViewportPresentation.ts', globals);
  return {
    render() { cursor = 0; effects = []; const result = useViewportPresentation(); effects.forEach((fn) => fn()); return result; },
    resize(nextWidth) { media.matches = nextWidth <= 639; listeners.forEach((fn) => fn()); },
    dispose() { slots.forEach((slot) => slot.cleanup?.()); },
    listeners, get queryCalls() { return queryCalls; },
  };
}

test('initial viewport selection preserves the existing compact boundary and fallback', () => {
  for (const width of [390, 430, 639, 640, 844, 1056]) {
    const h = viewportHarness(width);
    assert.equal(h.render(), width <= 639 ? 'mobile' : 'web');
    h.dispose(); assert.equal(h.listeners.size, 0);
  }
  for (const available of [false, 'no-match-media']) {
    const h = viewportHarness(390, available);
    assert.equal(h.render(), 'web'); assert.equal(h.listeners.size, 0);
  }
});

test('one media listener follows repeated presentation changes and is cleaned up', () => {
  const h = viewportHarness(1056);
  assert.equal(h.render(), 'web');
  const initialCalls = h.queryCalls;
  for (const width of [390, 430, 640, 639, 1056]) {
    h.resize(width);
    assert.equal(h.render(), width <= 639 ? 'mobile' : 'web');
    assert.equal(h.listeners.size, 1);
    assert.equal(h.queryCalls, initialCalls);
  }
  h.dispose(); assert.equal(h.listeners.size, 0);
});

test('both presentations keep the same provider, DOM host, and child element identities', () => {
  let presentation = 'web';
  const readingScopes = [];
  const context = React.createContext('web');
  const { AppPresentation } = compile('../src/presentation/AppPresentation.tsx', { require(name) {
    if (name === 'react') return React;
    if (name === 'react-router-dom') return { useLocation: () => ({ pathname: '/share/profile/project' }) };
    if (name === './usePresentation') return { PresentationContext: context };
    if (name === './useViewportPresentation') return { useViewportPresentation: () => presentation };
    if (name === './mobile/useMobileBrowserSurface') return { useMobileBrowserSurface: () => ({ current: null }) };
    if (name === './useAppZoomBoundary') return { useAppZoomBoundary() {} };
    if (name === './mobile/useProjectScrollActivity') return { useProjectScrollActivity: (enabled, path) => readingScopes.push([enabled, path]) };
    if (name.endsWith('.css')) return {};
    throw new Error(`Unexpected presentation dependency: ${name}`);
  } });
  const screen = React.createElement('main', { key: 'route-profile' }, 'Shared profile');
  const dialog = React.createElement('section', { key: 'publishing', role: 'dialog' });
  const children = [React.createElement('aside', { key: 'navigation' }), screen, dialog];
  const props = { className: 'app-shell codex-shell', 'data-layout-mode': 'adaptive', style: { color: 'inherit' }, children };
  const web = AppPresentation(props);
  presentation = 'mobile';
  const mobile = AppPresentation(props);
  assert.deepEqual(readingScopes, [[false, '/share/profile/project'], [true, '/share/profile/project']]);
  assert.equal(web.type, context.Provider); assert.equal(mobile.type, web.type);
  assert.equal(web.key, mobile.key);
  for (const [tree, mode] of [[web, 'web'], [mobile, 'mobile']]) {
    assert.equal(tree.props.value, mode);
    const host = tree.props.children;
    assert.equal(host.type, 'div'); assert.equal(host.key, null);
    assert.equal(host.props.children, children);
    assert.equal(host.props.style, props.style);
    assert.equal(host.props.className, props.className);
    assert.equal(host.props['data-layout-mode'], 'adaptive');
    assert.equal(host.props['data-presentation'], mode);
  }
});

test('every platform CSS selector is scoped, including nested rules and selector lists', () => {
  for (const mode of ['web', 'mobile']) {
    const root = postcss.parse(read(`../src/presentation/${mode}/${mode}.css`));
    let rules = 0;
    root.walkAtRules((rule) => assert.ok(['media', 'supports', 'container'].includes(rule.name), `Global @${rule.name} is not platform scoped`));
    root.walkRules((rule) => {
      rules++;
      for (const selector of rule.selectors) {
        // Frame rules can target the scoped host itself; descendant rules and
        // specific account overrides must stay behind the same boundary. A
        // presentation attribute also scopes body-portalled mobile controls,
        // with or without zero specificity for component-level overrides.
        const boundary = new RegExp(`^(?:(?:#root )?\\.codex-shell(?::where\\(\\[data-presentation='${mode}'\\]\\)|\\[data-presentation='${mode}'\\])|:where\\(\\[data-presentation='${mode}'\\]\\)|\\[data-presentation='${mode}'\\])(?: |$)`);
        assert.match(selector, boundary);
        assert.ok(!selector.includes(`data-presentation='${mode === 'web' ? 'mobile' : 'web'}'`));
      }
    });
    assert.ok(rules > 0);
  }
});

test('App retains one stable presentation host and route-only screen identity', () => {
  const source = ts.createSourceFile('App.tsx', read('../src/App.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hosts = [], keys = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'AppPresentation') hosts.push(node);
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'screenTransitionKey') keys.push(node.initializer.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(hosts.length, 1);
  assert.ok(!hosts[0].attributes.properties.some((prop) => prop.name?.getText(source) === 'key'));
  assert.equal(keys.length, 1);
  assert.doesNotMatch(keys[0], /presentation|viewport|isMobile/);
  assert.doesNotMatch(read('../src/index.tsx'), /WebApp|MobileApp|Presentation/);
});
