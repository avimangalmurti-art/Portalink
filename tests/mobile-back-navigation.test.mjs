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
  let presentation = 'mobile', cleanup, swipeBack;
  const react = { ...React,
    createContext(value) { const context = React.createContext(value); contexts.set(context, value); return context; },
    useContext: context => contexts.get(context),
    useRef: value => ({ current: value }),
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useLayoutEffect: effect => { cleanup?.(); cleanup = effect(); },
  };
  const api = compile('../src/presentation/mobile/MobileBackNavigation.tsx', name => name === 'react' ? react : name === './useMobileBackSwipe' ? { useMobileBackSwipe(_enabled, action) { swipeBack = action; } } : { usePresentation: () => presentation });
  let fallbackCalls = 0;
  const provider = api.MobileBackProvider({ onBack: () => fallbackCalls++, children: null });
  contexts.set(provider.type._context, provider.props.value);
  return { ...api, navigation: provider.props.value,
    scope(active = true, enabled = true) {
      const scope = api.MobileBackScope({ active, enabled, children: null });
      contexts.set(scope.type._context, scope.props.value);
    },
    presentation(value) { presentation = value; },
    swipe() { swipeBack(); },
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

test('centre swipes follow the visible screen Back action without hiding its controls or changing sidebar delegation', () => {
  const h = backHarness(); let calls = 0;
  h.scope(true, false);
  const child = React.createElement('button', { onClick: () => calls++ }, 'Back');
  const rendered = h.ScreenBack({ action: () => calls++, children: child });
  assert.equal(rendered.props.children, child);
  h.swipe(); assert.equal(calls, 1);
  h.navigation.back(); assert.equal(h.fallbackCalls, 1);
  h.dispose(); h.swipe(); assert.equal(h.fallbackCalls, 2);
});

test('clearing an outgoing gesture action preserves the newer active action and restores an earlier nested action', () => {
  const h = backHarness(), calls = [];
  const releaseOld = h.navigation.registerSwipe(() => calls.push('old'));
  const releaseNew = h.navigation.registerSwipe(() => calls.push('new'));
  releaseOld(); h.swipe(); assert.deepEqual(calls, ['new']);
  const releaseNested = h.navigation.registerSwipe(() => calls.push('nested'));
  h.swipe(); releaseNested(); h.swipe();
  assert.deepEqual(calls, ['new', 'nested', 'new']);
  releaseNew(); h.swipe(); assert.equal(h.fallbackCalls, 1);
});

test('a visible mobile Back control can opt in without losing its active-screen registration', () => {
  const h = backHarness();
  let calls = 0;
  h.scope();
  const action = () => calls++;
  const child = React.createElement('button', { onClick: action }, 'Back');
  const rendered = h.ScreenBack({ action, visibleOnMobile: true, children: child });
  assert.equal(rendered.props.children, child);
  rendered.props.children.props.onClick();
  h.navigation.back();
  assert.equal(calls, 2);
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
  let cursor = 0, options, actions, exits = 0, closes = 0;
  const routeChanges = [];
  const remembered = [], opened = [];
  let retries = 0;
  const ScreenBack = () => null;
  const NewChatPanel = () => null;
  const react = { ...React,
    useState(initialValue) {
      const i = cursor++;
      slots[i] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }];
    },
    useRef: value => ({ current: value }), useMemo: fn => fn(), useCallback: callback => callback, useEffect() {},
  };
  const props = { onBack: () => exits++, onConversationChange: (...args) => routeChanges.push(args), ...initial };
  const messaging = {
    messages: [], conversations: [], activeConversation: null, status: 'success',
    openConversation(conversation) { opened.push(conversation.id); },
    retryThread() { retries++; return Promise.resolve(true); },
    broadcastTyping() {},
    closeConversation() {
      closes++; messaging.activeConversation = null;
      props.initialConversationId = null; props.initialRecipientId = null;
      options.onConversationChange(null, true);
    },
  };
  const api = compile('../src/components/MessagesPage.tsx', name => {
    if (name.endsWith('/MobileContextActions')) return {useMobileScreenActions:model=>{actions=model}};
    if (name.endsWith('/contextActions')) return {contextActions:(_screen,_role,model)=>model};
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({ onTriggerKeyDown() {} }) };
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name === 'react') return react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/MobileBackNavigation')) return { ScreenBack, useMobileScreenActive: () => true };
    if (name.endsWith('/useMobileMessageContinuity')) return { useMobileMessageContinuity: () => ({ rememberOpen(opener) { remembered.push(opener); } }) };
    if (name.endsWith('/NewChatPanel')) return { NewChatPanel };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ viewerProfileId: 'me' }) };
    if (name.endsWith('/useMessaging')) return { useMessaging: args => { options = args; return messaging; } };
    if (name.endsWith('/ResizablePanelHandle')) return { ResizablePanelHandle: () => null, useResizablePanelWidth: () => ({ width: 400 }) };
    return new Proxy({}, { get: () => () => null });
  }, { sessionStorage: { getItem: () => null }, document: { activeElement: null } });
  return {
    render() { cursor = 0; return api.MessagesPage(props); }, messaging, routeChanges, remembered, opened,
    newMessage() { actions.handlers.newMessage(); },
    back(tree) { find(tree, node => node.type === ScreenBack && node.props.action).props.action(); },
    newChat(tree) { return find(tree, node => node.type === NewChatPanel); },
    get options() { return options; }, get exits() { return exits; }, get closes() { return closes; },
    get retries() { return retries; },
  };
}

test('only MOBILE opts into thread recovery and records the actual conversation opener', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = messagesHarness(presentation);
    const conversation = { id: 'thread-a', participant: { id: 'alice', name: 'Alice' } };
    h.messaging.conversations = [conversation];
    const tree = h.render(), opener = {};
    const row = find(tree, node => node.type === 'button' && find(node, child => child.type === 'span' && child.props.children === 'Alice'));
    row.props.onClick({ currentTarget: opener });
    assert.equal(h.options.mobileContinuity, presentation === 'mobile');
    assert.deepEqual(h.opened, ['thread-a']);
    assert.deepEqual(h.remembered, presentation === 'mobile' ? [opener] : []);
  }
});

test('MOBILE thread failures bind Retry to the thread, retain the error during Retry and suppress the empty introduction', () => {
  const h = messagesHarness();
  h.messaging.activeConversation = { id: 'thread-a', participant: { id: 'alice', name: 'Alice' } };
  h.messaging.threadLoadError = 'Messages could not reach the network.';
  let tree = h.render();
  assert.ok(find(tree, node => node.props.role === 'alert'));
  assert.equal(find(tree, node => node.props['data-message-introduction'] !== undefined), null);
  find(tree, node => node.type === 'button' && node.props.children === 'Retry').props.onClick({ currentTarget: {} });
  assert.equal(h.retries, 1);
  h.messaging.isRefreshingThread = true;
  tree = h.render();
  assert.equal(find(tree, node => node.type === 'button' && node.props.children === 'Retrying…').props.disabled, true);
  assert.ok(find(tree, node => node.props.role === 'alert'));
});

test('WEB does not render mobile-only thread recovery feedback', () => {
  const h = messagesHarness('web');
  h.messaging.activeConversation = { id: 'thread-a', participant: { id: 'alice', name: 'Alice' } };
  h.messaging.threadLoadError = 'Mobile-only refresh failure';
  const tree = h.render();
  assert.equal(find(tree, node => node.type === 'button' && node.props.children === 'Retry'), null);
  assert.equal(find(tree, node => node.props.role === 'alert'), null);
});

test('MOBILE unavailable thread keeps a Retry path and prevents Send from clearing the draft', () => {
  const h = messagesHarness();
  h.messaging.activeConversation = { id: 'thread-a', participant: { id: 'alice', name: 'Alice' } };
  h.messaging.threadUnavailable = true;
  let tree = h.render();
  find(tree, node => node.type === 'textarea').props.onChange({ target: { value: 'Keep this draft' } });
  tree = h.render();
  assert.ok(find(tree, node => node.type === 'button' && node.props.children === 'Retry'));
  assert.equal(find(tree, node => node.type === 'button' && node.props.children === 'Dismiss'), null);
  assert.equal(find(tree, node => node.props.description?.includes('Only you and this creator')), null);
  assert.equal(find(tree, node => node.props['aria-label'] === 'Send message').props.disabled, true);
  find(tree, node => node.type === 'form' && find(node, child => child.type === 'textarea')).props.onSubmit({ preventDefault() {} });
  assert.equal(find(h.render(), node => node.type === 'textarea').props.value, 'Keep this draft');
});

test('mobile Back closes New message first, then leaves Messages from the list', () => {
  const h = messagesHarness();
  let tree = h.render();
  h.newMessage();
  tree = h.render(); h.back(tree);
  assert.equal(h.closes, 2, 'Opening and dismissing cancel pending thread work');
  assert.equal(h.exits, 0);
  h.back(h.render()); assert.equal(h.exits, 1);
});

test('mobile New message uses one header and its visible Back returns to the list', () => {
  const h = messagesHarness();
  h.messaging.unreadCount = 3;
  h.render(); h.newMessage();
  let tree = h.render();
  assert.equal(find(tree, node => node.type === 'h1').props.children, 'New message');
  assert.equal(h.newChat(tree).props.showHeader, false);
  assert.equal(find(tree, node => node.props['aria-label'] === 'New message'), null);
  assert.equal(find(tree, node => node.props['aria-label'] === 'Message settings'), null);
  find(tree, node => node.props['aria-label'] === 'Back to messages').props.onClick();
  tree = h.render();
  assert.equal(h.newChat(tree), null);
  assert.equal(h.exits, 0);
  assert.equal(h.closes, 2, 'Visible Back cancels pending conversation starts');
  assert.equal(find(tree, node => node.type === 'h1').props.children, 'Messages');
  assert.equal(find(tree, node => node.props['aria-label'] === 'Message settings'), null);
  h.back(tree);
  assert.equal(h.exits, 1);
});

test('WEB retains its Messages toolbar and New message panel header', () => {
  const h = messagesHarness('web');
  find(h.render(), node => node.props['aria-label'] === 'New message').props.onClick();
  const tree = h.render();
  assert.equal(find(tree, node => node.type === 'h1').props.children, 'Messages');
  assert.equal(h.newChat(tree).props.showHeader, true);
  assert.ok(find(tree, node => node.props['aria-label'] === 'New message'));
  assert.ok(find(tree, node => node.props['aria-label'] === 'Message settings'));
});

test('hiding the embedded New message header preserves recipient search', () => {
  const api = compile('../src/components/messages/NewChatPanel.tsx', name => {
    if (name === 'react') return { ...React, useState: initial => [initial, () => {}], useMemo: fn => fn(), useRef: () => ({ current: null }), useEffect() {} };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ viewerProfileId: 'me' }) };
    if (name.endsWith('/useDirectory')) return { useDirectory: () => ({ people: [], status: 'success' }) };
    return new Proxy({}, { get: () => () => null });
  });
  for (const showHeader of [false, true, undefined]) {
    const tree = api.NewChatPanel({ showHeader, onClose() {}, onSelectCreator() {} });
    assert.equal(Boolean(find(tree, node => node.type === 'h2')), showHeader !== false);
    assert.equal(Boolean(find(tree, node => node.props['aria-label'] === 'Back to messages')), showHeader !== false);
    assert.ok(find(tree, node => node.type === 'input' && node.props.type === 'search'));
  }
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


test('profile Back invokes return directly and installs no swipe handlers', () => {
 let calls = 0;
 const api = compile('../src/presentation/mobile/MobileProfileBack.tsx', name => name === 'react' ? React : {ArrowLeftIcon:'ArrowLeftIcon'});
 const button = api.MobileProfileBack({onBack: () => calls++});
 assert.equal(button.props['aria-label'],'Back');
 button.props.onClick(); assert.equal(calls,1);
 assert.equal(button.props.onPointerDown,undefined);
 assert.equal(button.props.onTouchStart,undefined);
});
