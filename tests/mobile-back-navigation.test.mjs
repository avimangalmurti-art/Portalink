import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

function compile(path, require, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require, ...extra });
  return exports;
}

function backHarness() {
  const contexts = new Map();
  let presentation = 'mobile', cleanup;
  const react = { ...React,
    createContext(value) { const context = React.createContext(value); contexts.set(context, value); return context; },
    useContext: context => contexts.get(context),
    useRef: value => ({ current: value }),
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useLayoutEffect: effect => { cleanup?.(); cleanup = effect(); },
  };
  const api = compile('../src/presentation/mobile/MobileBackNavigation.tsx', name => name === 'react' ? react : { usePresentation: () => presentation });
  let fallbackCalls = 0;
  const provider = api.MobileBackProvider({ onBack: () => fallbackCalls++, children: null });
  contexts.set(provider.type._context, provider.props.value);
  return { ...api, navigation: provider.props.value,
    scope(active = true, enabled = true) {
      const scope = api.MobileBackScope({ active, enabled, children: null });
      contexts.set(scope.type._context, scope.props.value);
    },
    presentation(value) { presentation = value; },
    dispose() { cleanup?.(); },
    get fallbackCalls() { return fallbackCalls; },
  };
}

test('sidebar delegates to the current page and falls back after that page unmounts', () => {
  const h = backHarness();
  let calls = 0;
  h.scope();
  assert.equal(h.ScreenBack({ action: () => calls++, children: 'Back' }), null);
  h.useMobileBack(() => assert.fail('Wrong fallback'))();
  assert.equal(calls, 1);
  h.dispose();
  h.navigation.back();
  assert.equal(h.fallbackCalls, 1);
});

test('outgoing screens cannot steal Back or clear a newer screen registration', () => {
  const h = backHarness();
  const calls = [];
  const releaseOld = h.navigation.register(() => calls.push('old'));
  const releaseNew = h.navigation.register(() => calls.push('new'));
  releaseOld(); h.navigation.back();
  assert.deepEqual(calls, ['new']);
  releaseNew();
  h.scope(false);
  assert.equal(h.ScreenBack({ action: () => assert.fail('Outgoing action'), children: 'Back' }), null);
  h.navigation.back();
  assert.equal(h.fallbackCalls, 1);
});

test('WEB, public websites and controls outside the page scope retain their original buttons', () => {
  for (const [presentation, enabled] of [['web', true], ['mobile', false]]) {
    const h = backHarness(); h.presentation(presentation); h.scope(true, enabled);
    const child = React.createElement('button', { onClick: () => {} }, 'Back');
    const rendered = h.ScreenBack({ action: () => assert.fail('Must not register'), children: child });
    assert.equal(rendered.props.children, child);
    h.navigation.back(); assert.equal(h.fallbackCalls, 1);
  }
  const h = backHarness();
  assert.equal(h.ScreenBack({ children: 'Close dialog' }).props.children, 'Close dialog');
});

function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) {
    const found = find(child, predicate); if (found) return found;
  }
  return null;
}

function messagesHarness(presentation = 'mobile', initial = {}) {
  const slots = [];
  let cursor = 0, options, exits = 0, closes = 0;
  const routeChanges = [];
  const ScreenBack = () => null;
  const react = { ...React,
    useState(initialValue) {
      const i = cursor++;
      slots[i] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }];
    },
    useRef: value => ({ current: value }), useMemo: fn => fn(), useEffect() {},
  };
  const props = { onBack: () => exits++, onConversationChange: (...args) => routeChanges.push(args), ...initial };
  const messaging = {
    messages: [], conversations: [], activeConversation: null, status: 'success',
    closeConversation() {
      closes++; messaging.activeConversation = null;
      props.initialConversationId = null; props.initialRecipientId = null;
      options.onConversationChange(null, true);
    },
  };
  const api = compile('../src/components/MessagesPage.tsx', name => {
    if (name === 'react') return react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/MobileBackNavigation')) return { ScreenBack };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ viewerProfileId: 'me' }) };
    if (name.endsWith('/useMessaging')) return { useMessaging: args => { options = args; return messaging; } };
    if (name.endsWith('/ResizablePanelHandle')) return { useResizablePanelWidth: () => ({ width: 400 }) };
    return new Proxy({}, { get: () => () => null });
  }, { sessionStorage: { getItem: () => null } });
  return {
    render() { cursor = 0; return api.MessagesPage(props); }, messaging, routeChanges,
    back(tree) { find(tree, node => node.type === ScreenBack && node.props.action).props.action(); },
    get options() { return options; }, get exits() { return exits; }, get closes() { return closes; },
  };
}

test('mobile Back closes New message first, then leaves Messages from the list', () => {
  const h = messagesHarness();
  let tree = h.render();
  find(tree, node => node.props['aria-label'] === 'New message').props.onClick();
  tree = h.render(); h.back(tree);
  assert.equal(h.closes, 2, 'Opening and dismissing cancel pending thread work');
  assert.equal(h.exits, 0);
  h.back(h.render()); assert.equal(h.exits, 1);
});

test('mobile Back returns a loaded or deep-linked conversation to the list before exiting', () => {
  for (const loaded of [false, true]) {
    const h = messagesHarness('mobile', { initialConversationId: 'thread' });
    if (loaded) h.messaging.activeConversation = { id: 'thread', status: 'active', participant: { id: 'other', name: 'Other person' } };
    h.back(h.render());
    assert.equal(h.exits, 0); assert.equal(h.closes, 1);
    assert.deepEqual(h.routeChanges, [[null, true]]);
    h.back(h.render()); assert.equal(h.exits, 1);
  }
});

test('thread selection replaces mobile history while WEB retains push/replace behavior', () => {
  for (const presentation of ['web', 'mobile']) {
    const h = messagesHarness(presentation); h.render();
    h.options.onConversationChange('thread', false);
    h.options.onConversationChange('thread', true);
    assert.deepEqual(h.routeChanges, [['thread', presentation === 'mobile'], ['thread', true]]);
  }
});
