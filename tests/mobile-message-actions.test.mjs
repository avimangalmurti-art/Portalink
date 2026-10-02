import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function nodes(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
}
function compile(path, dependencies, extra = '', globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, {
    exports, React: dependencies.react, sessionStorage: { getItem: () => null }, ...globals,
    require(name) { return dependencies[name] ?? new Proxy({}, { get: (_object, key) => key === '__esModule' ? false : () => null }); },
  });
  return exports;
}
function stateReact(runEffects = false) {
  const slots = [], pendingEffects = []; let cursor = 0;
  return { react: { ...React,
    useEffect(effect, dependencies) {
      if (!runEffects) return;
      const index = cursor++, previous = slots[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        pendingEffects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: effect() }; });
      }
    }, useMemo: fn => fn(), useId: () => 'message-actions-title',
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
  }, reset() { cursor = 0; }, commitEffects() { pendingEffects.splice(0).forEach(effect => effect()); } };
}
const ownMessage = { id: 'message-1', conversationId: 'thread', senderProfileId: 'me', body: 'A message', createdAt: '2026-09-29T10:00:00Z', reactions: [{ emoji: '❤', count: 2, isMine: true }] };
function listHarness(presentation = 'mobile', overrides = {}, runEffects = false) {
  const state = stateReact(runEffects), calls = [], frames = new Map(), elements = new Map();
  let frameId = 0, activeElement = null;
  function element(key) {
    if (!elements.has(key)) elements.set(key, { key, isConnected: true, disabled: false, focus() { if (this.isConnected && !this.disabled) activeElement = this; } });
    return elements.get(key);
  }
  const MobileMessageActions = () => null;
  const props = { messages: [ownMessage], viewerProfileId: 'me', canInteract: true, participantReadAt: null, pendingMessageId: null,
    onRetry: async id => { calls.push(['retry', id]); return true; },
    onEdit: async (id, body) => { calls.push(['edit', id, body]); return true; },
    onDelete: async id => { calls.push(['delete', id]); return true; },
    onReact: async (id, emoji) => { calls.push(['react', id, emoji]); return true; }, ...overrides };
  const api = compile('../src/components/MessagesPage.tsx', {
    react: state.react,
    '../presentation/usePresentation': { usePresentation: () => presentation },
    './messages/MobileMessageActions': { MobileMessageActions },
  }, '\nexport { MessageList };', {
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const render = () => {
    state.reset(); const tree = api.MessageList(props);
    for (const item of elements.values()) item.isConnected = false;
    for (const node of nodes(tree)) {
      if (node.type !== 'button' && node.type !== 'textarea') continue;
      const key = `${node.type}:${node.props['aria-label'] ?? node.props.children}`;
      const dom = element(key); dom.isConnected = true; dom.disabled = Boolean(node.props.disabled);
      if (node.ref && typeof node.ref === 'object') node.ref.current = dom;
    }
    state.commitEffects();
    return tree;
  };
  const button = label => {
    const node = nodes(render()).find(node => node.type === 'button' && (node.props['aria-label'] === label || node.props.children === label));
    return node ? { ...node, props: { ...node.props, onClick: (event = { currentTarget: element(`button:${label}`) }) => node.props.onClick(event) } } : undefined;
  };
  return { render, props, calls, button, sheet: () => nodes(render()).find(node => node.type === MobileMessageActions),
    flushFrames() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
    sheetCleanup() { activeElement = null; element('button:Message options').focus(); },
    get focused() { return activeElement?.key.split(':').slice(1).join(':') ?? null; },
    get focusedType() { return activeElement?.key.split(':')[0] ?? null; },
  };
}

test('MOBILE opens visible message options and uses existing reaction, edit and confirmed unsend handlers', async () => {
  const h = listHarness();
  const trigger = h.button('Message options');
  assert.match(trigger.props.className, /h-11 w-11/);
  assert.doesNotMatch(trigger.props.className, /opacity-0/);
  assert.equal(trigger.props['aria-haspopup'], 'dialog');
  assert.equal(h.button('Edit message'), undefined);
  trigger.props.onClick();
  assert.equal(h.sheet().props.message.id, 'message-1');
  h.sheet().props.onReact('👏');
  assert.equal(h.sheet(), undefined);
  assert.deepEqual(h.calls, [['react', 'message-1', '👏']]);

  h.button('Message options').props.onClick(); h.sheet().props.onEdit();
  assert.equal(h.sheet(), undefined);
  const editor = nodes(h.render()).find(node => node.type === 'textarea');
  assert.equal(editor.props.value, 'A message');
  assert.equal(editor.props['aria-label'], 'Edit message');
  editor.props.onChange({ target: { value: 'Changed message' } });
  nodes(h.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await Promise.resolve();
  assert.deepEqual(h.calls.at(-1), ['edit', 'message-1', 'Changed message']);
  assert.equal(nodes(h.render()).some(node => node.type === 'textarea'), false);

  h.button('Message options').props.onClick(); h.sheet().props.onRequestUnsend();
  assert.equal(h.sheet(), undefined);
  assert.equal(h.calls.some(([action]) => action === 'delete'), false, 'Opening confirmation must not delete');
  assert.match(h.button('Unsend').props.className, /min-h-\[44px\]/);
  h.button('Cancel').props.onClick();
  assert.equal(h.button('Unsend'), undefined);
  h.button('Message options').props.onClick(); h.sheet().props.onRequestUnsend();
  h.button('Unsend').props.onClick(); await Promise.resolve();
  assert.deepEqual(h.calls.at(-1), ['delete', 'message-1']);
  assert.equal(h.button('Unsend'), undefined);
});

test('MOBILE permissions, pending state and removed or local messages keep their interaction restrictions', () => {
  for (const overrides of [{ canInteract: false }, { messages: [{ ...ownMessage, id: 'local-message' }] }, { messages: [{ ...ownMessage, isRemoved: true }] }]) {
    assert.equal(listHarness('mobile', overrides).button('Message options'), undefined);
  }
  const pending = listHarness('mobile', { pendingMessageId: ownMessage.id });
  assert.equal(pending.button('Message options').props.disabled, true);
  const incoming = listHarness('mobile', { messages: [{ ...ownMessage, senderProfileId: 'other' }] });
  incoming.button('Message options').props.onClick();
  assert.equal(incoming.sheet().props.isMine, false);
  incoming.props.messages = [{ ...ownMessage, isRemoved: true }];
  assert.equal(incoming.sheet(), undefined, 'Removal while open immediately hides the sheet');
  const revoked = listHarness(); revoked.button('Message options').props.onClick();
  revoked.props.canInteract = false;
  assert.equal(revoked.sheet(), undefined, 'A revoked thread cannot keep an action sheet open');
});

test('WEB retains hover actions, reveals the group on keyboard focus and does not receive a mobile sheet', () => {
  const h = listHarness('web');
  assert.equal(h.button('Message options'), undefined);
  for (const label of ['Edit message', 'Unsend message', 'React 👏']) {
    assert.match(h.button(label).props.className, /opacity-0.*group-hover\/message:opacity-70/);
    assert.match(h.button(label).props.className, /group-focus-within\/message:opacity-70/);
  }
  h.button('Edit message').props.onClick();
  assert.ok(nodes(h.render()).find(node => node.type === 'textarea'));
  assert.doesNotMatch(h.button('Save').props.className, /min-h-\[44px\]/);
  assert.equal(h.sheet(), undefined);
});

test('WEB edit shortcuts preserve multiline input and composition, and return focus after cancel/save', async () => {
  const h = listHarness('web', {}, true);
  const editor = () => nodes(h.render()).find(node => node.type === 'textarea');
  const key = (value, extra = {}) => {
    const event = { key: value, ctrlKey: false, metaKey: false, nativeEvent: { isComposing: false }, prevented: false,
      preventDefault() { this.prevented = true; }, stopPropagation() {},
      currentTarget: { form: { requestSubmit() { nodes(h.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); } } }, ...extra };
    editor().props.onKeyDown(event); return event;
  };
  h.button('Edit message').props.onClick(); h.render(); h.flushFrames();
  assert.equal(h.focusedType, 'textarea');
  assert.equal(key('Enter').prevented, false, 'Plain Enter remains a newline');
  assert.equal(key('Escape', { nativeEvent: { isComposing: true } }).prevented, false);
  assert.ok(editor(), 'Composition Escape must not close the editor');
  assert.equal(key('Escape').prevented, true); h.render(); h.flushFrames();
  assert.equal(editor(), undefined); assert.equal(h.focused, 'Edit message'); assert.equal(h.focusedType, 'button');

  for (const modifier of ['ctrlKey', 'metaKey']) {
    h.button('Edit message').props.onClick(); editor().props.onChange({ target: { value: `Saved with ${modifier}` } });
    assert.equal(key('Enter', { [modifier]: true }).prevented, true);
    await Promise.resolve(); h.render(); h.flushFrames();
    assert.deepEqual(h.calls.at(-1), ['edit', ownMessage.id, `Saved with ${modifier}`]);
    assert.equal(h.focusedType, 'button');
  }
  h.button('Edit message').props.onClick();
  h.props.pendingMessageId = ownMessage.id;
  assert.equal(key('Escape').prevented, false); assert.ok(editor());
  assert.equal(key('Enter', { ctrlKey: true }).prevented, false);
  h.props.pendingMessageId = null;
  editor().props.onChange({ target: { value: '   ' } });
  const before = h.calls.length; key('Enter', { ctrlKey: true });
  assert.equal(h.calls.length, before, 'An empty edit is not submitted');

  const mobile = listHarness(); mobile.button('Message options').props.onClick(); mobile.sheet().props.onEdit();
  assert.equal(nodes(mobile.render()).find(node => node.type === 'textarea').props.onKeyDown, undefined, 'MOBILE gains no desktop shortcuts');
});

test('WEB unsend focuses its Cancel and cancellation restores its enabled trigger', () => {
  const h = listHarness('web', {}, true);
  h.button('Unsend message').props.onClick(); h.render(); h.flushFrames();
  assert.equal(h.focused, 'Cancel');
  assert.equal(h.button('Unsend message').props.disabled, true);
  assert.equal(h.calls.length, 0);
  h.button('Cancel').props.onClick(); h.render(); h.flushFrames();
  assert.equal(h.focused, 'Unsend message');
  assert.equal(h.button('Unsend message').props.disabled, false);
});

test('MOBILE hands focus from the sheet to Unsend Cancel and restores its enabled opener after cancel', () => {
  const h = listHarness('mobile', {}, true);
  h.button('Message options').props.onClick();
  h.sheet().props.onRequestUnsend();
  assert.equal(h.button('Message options').props.disabled, true);
  h.sheetCleanup(); assert.equal(h.focused, null, 'The disabled opener cannot accept sheet cleanup focus');
  h.flushFrames(); assert.equal(h.focused, 'Cancel');
  h.button('Cancel').props.onClick();
  assert.equal(h.button('Message options').props.disabled, false);
  h.flushFrames(); assert.equal(h.focused, 'Message options');

  h.button('Message options').props.onClick(); h.sheet().props.onEdit(); h.render();
  h.sheetCleanup(); h.flushFrames(); assert.equal(h.focused, 'Edit message');
  h.button('Cancel').props.onClick(); h.render(); h.flushFrames();
  assert.equal(h.focused, 'Message options', 'Edit cancellation also returns to its usable opener');
});

function sheetHarness(isMine = true) {
  const state = stateReact(), calls = []; let escape;
  const props = { message: ownMessage, isMine, pending: false,
    onClose: () => calls.push('close'), onReact: emoji => calls.push(['react', emoji]), onEdit: () => calls.push('edit'), onRequestUnsend: () => calls.push('confirm-unsend') };
  const sheetApi = compile('../src/components/messages/MobileActionSheet.tsx', {
    react: state.react,
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus(open, _ref, close, preventScroll) { assert.equal(open, true); assert.equal(preventScroll, true); escape = close; } },
  });
  const contextModule = compile('../src/presentation/mobile/contextActions.ts', {});
  const api = compile('../src/components/messages/MobileMessageActions.tsx', {
    react: state.react,
    '../../presentation/mobile/contextActions': contextModule,
    './MobileActionSheet': { MobileActionSheet: 'sheet' },
    'react-dom': { flushSync: fn => fn() },
    '../../presentation/mobile/contextFocus': { focusMobileContextButton() {} },
  });
  const render = () => { state.reset(); const adapter = api.MobileMessageActions(props); return sheetApi.MobileActionSheet(adapter.props); };
  return { render, props, calls, escape: () => escape() };
}

test('action sheet supports focus dismissal, touch reactions and only shows editing for the sender', () => {
  const h = sheetHarness(); const tree = h.render();
  assert.ok(nodes(tree).find(node => node.props.role === 'dialog' && node.props['aria-modal']));
  const reactions = nodes(tree).filter(node => node.type === 'button' && node.props['aria-pressed'] !== undefined);
  assert.equal(reactions.length, 3, 'Existing default reaction is not duplicated');
  assert.equal(reactions[0].props['aria-label'], 'Remove reaction ❤');
  assert.equal(reactions[0].props['aria-pressed'], true);
  for (const reaction of reactions) assert.match(reaction.props.className, /min-h-\[44px\] min-w-\[44px\]/);
  reactions[0].props.onClick(); assert.deepEqual(h.calls.at(-1), ['react', '❤']);
  h.escape(); assert.equal(h.calls.at(-1), 'close');
  const overlay = nodes(tree).find(node => node.props.className?.includes('mobile-context-scrim'));
  const background = {}; const before = h.calls.length;
  overlay.props.onClick({ target: {}, currentTarget: background }); assert.equal(h.calls.length, before);
  overlay.props.onClick({ target: background, currentTarget: background }); assert.equal(h.calls.at(-1), 'close');
  const incomingButtons = nodes(sheetHarness(false).render()).filter(node => node.type === 'button');
  assert.equal(incomingButtons.length, 6, 'Incoming messages have Resize, Close, React, and three emoji choices');
  h.props.pending = true;
  const mutationButtons = nodes(h.render()).filter(node => node.type === 'button' && node.props['aria-label'] !== 'Close actions' && node.props.className !== 'mobile-context-resize');
  assert.equal(mutationButtons.length, 0);
});

test('message sheet resizing preserves reactions and pending state still permits resizing and dismissal', () => {
  const h = sheetHarness();
  const resize = () => nodes(h.render()).find(node => node.props.className === 'mobile-context-resize');
  const dialog = () => nodes(h.render()).find(node => node.props.role === 'dialog');
  resize().props.onClick({ detail: 0 });
  assert.equal(dialog().props['data-expanded'], true);
  const reactions = nodes(h.render()).filter(node => node.type === 'button' && node.props['aria-pressed'] !== undefined);
  assert.equal(reactions.length, 3);
  reactions[1].props.onClick();
  assert.equal(h.calls.at(-1)[0], 'react');
  h.props.pending = true;
  assert.equal(nodes(h.render()).some(node => node.props['aria-pressed'] !== undefined), false);
  assert.equal(resize().props.disabled, undefined);
  const before = h.calls.length;
  resize().props.onClick({ detail: 0 });
  assert.equal(dialog().props['data-expanded'], false);
  assert.equal(h.calls.length, before, 'Resizing cannot invoke a message mutation');
  nodes(h.render()).find(node => node.props['aria-label'] === 'Close actions').props.onClick();
  assert.equal(h.calls.at(-1), 'close');
});

function conversationHarness(presentation = 'mobile') {
  const state = stateReact(); const EmptyState = () => null;
  const NewChatPanel = () => null;
  const api = compile('../src/components/MessagesPage.tsx', {
    react: state.react,
    '../hooks/useMenuFocus': { useMenuFocus: () => ({}) },
    '../presentation/usePresentation': { usePresentation: () => presentation },
    '../contexts/AuthContext': { useAuth: () => ({ viewerProfileId: 'me' }) },
    '../features/messages/useMessaging': { useMessaging: () => ({ messages: [], conversations: [], activeConversation: null, status: 'success', closeConversation() {} }) },
    './ui/ResizablePanelHandle': { ResizablePanelHandle: () => null, useResizablePanelWidth: () => ({ width: 400 }) },
    './ui/StateViews': { EmptyState },
    './messages/NewChatPanel': { NewChatPanel },
  });
  const render = () => { state.reset(); return api.MessagesPage({ onBack() {} }); };
  return { render, empty: () => nodes(render()).find(node => node.type === EmptyState),
    hasNewChat: () => nodes(render()).some(node => node.type === NewChatPanel),
    search(value) { nodes(render()).find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value } }); },
    unread() { nodes(render()).find(node => node.props.label === 'Unread').props.onSelect(); } };
}

test('empty conversation search and filters have recovery actions on both presentations', () => {
  for (const presentation of ['mobile', 'web']) {
  const h = conversationHarness(presentation);
  assert.equal(h.empty().props.action.label, 'New message');
  h.unread(); assert.equal(h.empty().props.action.label, 'Clear filter');
  h.search('no match'); assert.equal(h.empty().props.title, 'No matching conversations');
  assert.equal(h.empty().props.action.label, 'Clear search');
  h.empty().props.action.onClick();
  assert.equal(h.empty().props.title, 'No unread messages');
  h.empty().props.action.onClick();
  assert.equal(h.empty().props.action.label, 'New message');
  }
});

test('WEB empty right pane has a working New message action without adding it to MOBILE', () => {
  const startButton = h => nodes(h.render()).find(node => node.type === 'button' && React.Children.toArray(node.props.children).includes('New message'));
  const web = conversationHarness('web');
  assert.ok(startButton(web)); startButton(web).props.onClick();
  assert.equal(web.hasNewChat(), true);
  assert.equal(startButton(conversationHarness('mobile')), undefined);
});


test('MOBILE inbox removes the redundant header while WEB and new-message headers remain', () => {
  const mobile = conversationHarness('mobile');
  assert.equal(nodes(mobile.render()).some(node => node.type === 'header'), false);
  assert.equal(nodes(mobile.render()).find(node => node.props.id === 'messages-heading').props.className, 'sr-only');
  assert.equal(nodes(mobile.render()).some(node => node.props['aria-label'] === 'Message settings'), false);
  mobile.empty().props.action.onClick();
  assert.equal(mobile.hasNewChat(), true);
  assert.ok(nodes(mobile.render()).find(node => node.type === 'header'));
  assert.equal(nodes(mobile.render()).find(node => node.props.id === 'messages-heading').props.children, 'New message');
  const web = conversationHarness('web');
  assert.ok(nodes(web.render()).find(node => node.type === 'header'));
  assert.ok(nodes(web.render()).find(node => node.props['aria-label'] === 'Message settings'));
  assert.ok(nodes(web.render()).find(node => node.props['aria-label'] === 'New message'));
});
