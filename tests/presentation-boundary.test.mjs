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
  const { AppPresentation, AppPresentationProvider } = compile('../src/presentation/AppPresentation.tsx', { require(name) {
    if(name.endsWith('/MotionNavigation'))return {MotionNavigation:'motion-navigation'};
    if (name.endsWith('/InternalContentShare')) return {InternalContentShareProvider:'InternalContentShareProvider'};
    if (name === 'react') return React;
    if (name === 'react-router-dom') return { useLocation: () => ({ pathname: '/share/profile/project' }) };
    if (name.endsWith('/MobileContextActions')) return { MobileContextProvider: 'MobileContextProvider' };
    if (name === './usePresentation') return { PresentationContext: context, usePresentation: () => presentation };
    if (name === './useViewportPresentation') return { useViewportPresentation: () => presentation };
    if (name === './mobile/useMobileBrowserSurface') return { useMobileBrowserSurface: () => ({ current: null }) };
    if (name === './mobile/useMobileHeaderMaterial') return { useMobileHeaderMaterial() {} };
    if (name === './mobile/useMobileViewportFrame') return { useMobileViewportFrame() {} };
    if (name === './useAppZoomBoundary') return { useAppZoomBoundary() {} };
    if (name === './mobile/useProjectScrollActivity') return { useProjectScrollActivity: (enabled, path) => readingScopes.push([enabled, path]) };
    if (name.endsWith('.css')) return {};
    throw new Error(`Unexpected presentation dependency: ${name}`);
  } });
  const screen = React.createElement('main', { key: 'route-profile' }, 'Shared profile');
  const dialog = React.createElement('section', { key: 'publishing', role: 'dialog' });
  const children = [React.createElement('aside', { key: 'navigation' }), screen, dialog];
  const props = { className: 'app-shell codex-shell', 'data-layout-mode': 'adaptive', style: { color: 'inherit' }, children };
  const web = { provider: AppPresentationProvider({ children }), host: AppPresentation(props) };
  presentation = 'mobile';
  const mobile = { provider: AppPresentationProvider({ children }), host: AppPresentation(props) };
  assert.deepEqual(readingScopes, [[false, '/share/profile/project'], [true, '/share/profile/project']]);
  assert.equal(web.provider.type, context.Provider); assert.equal(mobile.provider.type, web.provider.type);
  assert.equal(web.provider.key, mobile.provider.key);
  for (const [tree, mode] of [[web, 'web'], [mobile, 'mobile']]) {
    assert.equal(tree.provider.props.value, mode);
    assert.equal(tree.provider.props.children.type,'motion-navigation');assert.equal(tree.provider.props.children.props.children,children);
    const host = tree.host;
    assert.equal(host.type, 'div'); assert.equal(host.key, null);
    assert.equal(host.props.children.type, 'InternalContentShareProvider');
    assert.equal(host.props.children.props.children.type, 'MobileContextProvider');
    assert.equal(host.props.children.props.children.props.children, children);
    assert.equal(host.props.style, props.style);
    assert.equal(host.props.className, props.className);
    assert.equal(host.props['data-layout-mode'], 'adaptive');
    assert.equal(host.props['data-presentation'], mode);
  }
});

function presentationBoundary(mode) {
  // The attribute may scope the shell itself or a descendant portal host.
  // The optional literal space permits only that descendant relation: no
  // unscoped siblings, negated attributes, or arbitrary intervening selectors.
  return new RegExp(`^(?:(?:#root )?\\.(?:codex|app)-shell(?::where\\(\\[data-presentation='${mode}'\\]\\)| ?\\[data-presentation='${mode}'\\])|:where\\(\\[data-presentation='${mode}'\\]\\)|(?:#root )?\\[data-presentation='${mode}'\\])(?=[\\s:.#\\[]|$)`);
}

test('presentation scope accepts an explicitly scoped descendant without accepting siblings or lookalike attributes', () => {
  for (const mode of ['web', 'mobile']) {
    const boundary = presentationBoundary(mode);
    const compoundShellBoundary = new RegExp(`^#root \\.(?:codex|app)-shell(?:\\.(?:theme-dark|theme-light))?\\[data-presentation=['\"]${mode}['\"]\\](?=[\\s:.#\\[]|$)`);
    assert.ok(boundary.test(`#root .codex-shell [data-presentation='${mode}'] .mobile-project-description-sheet`));
    assert.ok(boundary.test(`#root .codex-shell[data-presentation='${mode}'] .surface`));
    assert.ok(boundary.test(`#root [data-presentation='${mode}'] [data-loading-layout]`));
    for (const selector of [
      '#root .codex-shell .mobile-project-description-sheet',
      `#root .codex-shell.unscoped[data-presentation='${mode}'] .surface`,
      `#root .codex-shell + [data-presentation='${mode}'] .surface`,
      `#root .codex-shell :not([data-presentation='${mode}']) .surface`,
      `#root .codex-shell [data-presentation='${mode}-other'] .surface`,
      `#root .codex-shell [data-presentation='${mode === 'mobile' ? 'web' : 'mobile'}'] .surface`,
    ]) assert.equal((boundary.test(selector) || compoundShellBoundary.test(selector)), false, selector);
  }
});

test('every platform CSS selector is scoped, including nested rules and selector lists', () => {
  for (const mode of ['web', 'mobile']) {
    const root = postcss.parse(read(`../src/presentation/${mode}/${mode}.css`));
    let rules = 0;
    const animationNames = new Set();
    root.walkAtRules((rule) => {
      if (rule.name === 'keyframes') {
        // Keyframe steps aren't DOM selectors. Keep their names unique to this
        // presentation, including the existing mobile description transition.
        assert.ok(rule.params.startsWith(`${mode}-`) || (mode === 'mobile' && rule.params === 'project-description-arrive'), `Unscoped animation ${rule.params}`);
        assert.ok(!animationNames.has(rule.params), `Duplicate animation ${rule.params}`);
        animationNames.add(rule.params);
        const otherMode = mode === 'web' ? 'mobile' : 'web';
        assert.ok(!read(`../src/presentation/${otherMode}/${otherMode}.css`).includes(rule.params), `Animation ${rule.params} crosses presentations`);
        assert.ok(!read('../src/index.css').includes(rule.params), `Animation ${rule.params} collides with shared CSS`);
        return;
      }
      assert.ok(['media', 'supports', 'container'].includes(rule.name), `Global @${rule.name} is not platform scoped`);
    });
    root.walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && rule.parent.name === 'keyframes') {
        for (const step of rule.selectors) assert.match(step, /^(?:from|to|(?:100|\d{1,2})(?:\.\d+)?%)$/);
        return;
      }
      rules++;
      for (const selector of rule.selectors) {
        // Frame rules can target the scoped host itself; descendant rules and
        // specific account overrides must stay behind the same boundary. A
        // presentation attribute also scopes body-portalled mobile controls,
        // with or without zero specificity for component-level overrides.
        // A compound host selector (:has(), data attributes, etc.) retains scope.
        const boundary = presentationBoundary(mode);
        const compoundShellBoundary = new RegExp(`^#root \\.(?:codex|app)-shell(?:\\.(?:theme-dark|theme-light))?\\[data-presentation=['\"]${mode}['\"]\\](?=[\\s:.#\\[]|$)`);
        // AccountWelcomeSurface emits this alternate DOM scope only when
        // usePresentation() is mobile; account-entry-focus exercises that gate.
        const mobileOnboardingBoundary = /^#root \.codex-shell (?:\.auth-signin-experience)?\[data-mobile-onboarding(?:='(?:light|dark)')?\](?=[\s:.#\[]|$)/;
        // Safari document scrolling must unlock ancestors of AppPresentation.
        // Permit only these canvas declarations, inside the exact phone query;
        // other document rules still require the normal presentation boundary.
        const canvasSelectors = new Set([
          'html:root', 'html:root body', 'html:root #root',
          'html:root[data-standalone]', 'html:root[data-standalone] body', 'html:root[data-standalone] #root',
        ]);
        const mobileDocumentCanvas = mode === 'mobile' && canvasSelectors.has(selector)
          && rule.parent?.type === 'atrule' && rule.parent.name === 'media'
          && rule.parent.params === '(max-width: 639px)'
          && rule.nodes.length > 0 && rule.nodes.every((node) => node.type === 'decl' && !node.important && (
            (node.prop === 'height' && node.value === 'auto')
            || (node.prop === 'min-height' && node.value === '100dvh')
            || (node.prop === 'overflow' && node.value === 'visible')
            || (selector === 'html:root' && node.prop === 'overflow-x' && node.value === 'clip')
          ));
        // The existing portal popup locks its document ancestor only while an
        // active MOBILE overlay exists; it must not become a global root lock.
        const mobilePortalScrollLock = mode === 'mobile'
          && selector === "html:has([data-presentation='mobile'] :is(.mobile-profile-portal-overlay, .mobile-project-index-overlay):not(.screen-exit *, [inert] *, [aria-hidden='true'] *))"
          && rule.nodes.length === 2 && rule.nodes.every((node) => node.type === 'decl' && !node.important && (
            (node.prop === 'overflow' && node.value === 'hidden')
            || (node.prop === 'overscroll-behavior' && node.value === 'none')
          ));
        // Studio alone locks document scrolling while its active MOBILE screen
        // delegates scrolling to its inner results pane. Never permit a global lock.
        const studioScope = "#root .codex-shell[data-presentation='mobile'] .app-screen-layer.screen-active .studio-citation-shell";
        const worldScope = "#root .codex-shell[data-presentation='mobile'] .app-screen-layer.screen-active .portalink-world";
        const mobileStudioScrollLock = mode === 'mobile'
          && [studioScope, worldScope].some(scope => [`html:has(${scope})`, `body:has(${scope})`].includes(selector))
          && rule.nodes.length === 3 && rule.nodes.every(node => node.type === 'decl' && !node.important && (
            (node.prop === 'height' && node.value === '100%')
            || (node.prop === 'overflow' && node.value === 'hidden')
            || (node.prop === 'overscroll-behavior-y' && node.value === 'none')
          ));
        const mobileRoot = "html:has(.codex-shell[data-presentation='mobile'])";
        const mobileDocumentScrollbar = mode === 'mobile' && rule.nodes.length === 1 && rule.nodes.every(node => node.type === 'decl' && !node.important && (
          ([mobileRoot, `${mobileRoot} body`].includes(selector) && node.prop === 'scrollbar-width' && node.value === 'none')
          || ([`${mobileRoot}::-webkit-scrollbar`,`${mobileRoot} body::-webkit-scrollbar`].includes(selector) && node.prop === 'display' && node.value === 'none')
        ));
        const readerRoot = "html:has(.codex-shell[data-presentation='mobile'] [data-mobile-project-view]:not(.screen-exit *))";
        const mobileReaderScrollbar = mode === 'mobile' && rule.nodes.length === 1 && rule.nodes.every((node) => node.type === 'decl' && !node.important && (
          ([readerRoot, `${readerRoot} body`].includes(selector) && node.prop === 'scrollbar-width' && node.value === 'none')
          || ([`${readerRoot}::-webkit-scrollbar`, `${readerRoot} body::-webkit-scrollbar`].includes(selector) && node.prop === 'display' && node.value === 'none')
        ));
        assert.ok((boundary.test(selector) || compoundShellBoundary.test(selector)) || (mode === 'mobile' && mobileOnboardingBoundary.test(selector)) || mobileDocumentCanvas || mobilePortalScrollLock || mobileReaderScrollbar || mobileDocumentScrollbar || mobileStudioScrollLock, `Unscoped ${mode} selector: ${selector}`);
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
