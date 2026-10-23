import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const messages = (count = 30, prefix = 'a', sender = 'other') => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, conversationId: prefix, senderProfileId: sender, body: `Message ${index}`, createdAt: `2026-10-21T10:${String(index % 60).padStart(2, '0')}:00Z` }));

/** Production hook and motion policy, with controlled React commits, DOM geometry and native input. */
function fixture(initial = {}) {
  const slots = [], events = new Map(), mediaEvents = new Map(), frames = new Map(), animations = [], mutations = [], resizes = [], focuses = [], scrollWrites = [], marks = [], below = [];
  let cursor = 0, effects = [], layout = [], mounted = true, api, sequence = 0, rowReads = 0, appReduce = false, reduced = false;
  const add = (map, name, callback) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(callback); };
  const remove = (map, name, callback) => { map.get(name)?.delete(callback); if (!map.get(name)?.size) map.delete(name); };
  const emit = (map, name, event = {}) => { for (const callback of [...(map.get(name) ?? [])]) if (map.get(name)?.has(callback)) callback(event); };
  let document;
  class Element {
    constructor(name) { this.name = name; this.dataset = {}; this.style = { overflowAnchor: 'auto' }; this.events = new Map(); this.parentElement = null; this.isConnected = true; this.hidden = false; this.inert = false; this.disabled = false; this.height = 500; this.padding = 0; this.contentHeight = 2000; this._top = 0; this.scrollLeft = 0; this.children = []; this.kind = 'div'; }
    get scrollTop() { return this._top; }
    set scrollTop(value) { this._top = Math.max(0, Math.min(value, Math.max(0, this.scrollHeight - this.clientHeight))); scrollWrites.push([this.name, this._top]); }
    get scrollHeight() { return this.zeroGeometry ? 0 : this === scroller ? this.padding + this.children.reduce((sum, row) => sum + row.height, 0) : this.contentHeight; }
    get clientHeight() { return this.zeroGeometry ? 0 : this.height; }
    contains(target) { for (let node = target; node; node = node.parentElement) if (node === this) return true; return false; }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (selector === 'ol' ? node.kind === 'ol' : node.inert || node.ariaHidden) return node; return null; }
    matches(selector) { return selector === ':disabled' ? this.disabled : /input|textarea|contenteditable/.test(selector) && ['input', 'textarea'].includes(this.kind); }
    getClientRects() { for (let node = this; node; node = node.parentElement) if (node.hidden || !node.isConnected) return []; return [{}]; }
    getBoundingClientRect() {
      let top = 100, height = this.height;
      if (this.dataset.messageId) { rowReads++; top += scroller.padding + scroller.children.slice(0, scroller.children.indexOf(this)).reduce((sum, row) => sum + row.height, 0) - scroller.scrollTop; }
      if (this === opener) top += 600 - list.scrollTop;
      return { top, bottom: top + height, left: 0, right: 420, height, width: 420 };
    }
    querySelectorAll(selector) { return selector === '[data-message-id]' ? this.children : []; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    addEventListener(name, callback) { add(this.events, name, callback); }
    removeEventListener(name, callback) { remove(this.events, name, callback); }
    focus(options) { document.activeElement = this; this.focusOptions = options; focuses.push({ target: this, options, listTop: list.scrollTop, listLeft: list.scrollLeft }); }
    animate(keyframes, options) {
      let resolve, reject;
      const animation = { keyframes, options, finished: new Promise((yes, no) => { resolve = yes; reject = no; }), cancel() { this.cancelled = true; reject(new Error('Cancelled')); }, finish() { resolve(); }, fail() { reject(new Error('Failed')); } };
      animations.push(animation); return animation;
    }
  }
  const body = new Element('body'), viewport = new Element('app-viewport'), listPanel = new Element('inbox'), threadPanel = new Element('thread'), list = new Element('list'), scroller = new Element('scroller'), opener = new Element('conversation opener'), content = new Element('messages'), composer = new Element('composer');
  opener.height = 44; opener.parentElement = list; list.parentElement = listPanel; scroller.parentElement = threadPanel; content.parentElement = scroller; content.kind = 'ol'; composer.kind = 'textarea'; composer.parentElement = threadPanel;
  document = { body, activeElement: body, documentElement: new Element('html'), modal: null, querySelector: selector => selector === '#app-viewport' ? viewport : selector.includes('.reduce-motion') ? appReduce ? viewport : null : document.modal };
  const media = { get matches() { return reduced; }, addEventListener: (name, callback) => add(mediaEvents, name, callback), removeEventListener: (name, callback) => remove(mediaEvents, name, callback) };
  const window = { matchMedia: () => media, addEventListener: (name, callback) => add(events, name, callback), removeEventListener: (name, callback) => remove(events, name, callback) };
  class Observer { constructor(callback) { this.callback = callback; this.active = true; this.nodes = []; this.settings = []; } observe(node, settings) { this.nodes.push(node); this.settings.push(settings); } disconnect() { this.active = false; } }
  const globals = { document, window, HTMLElement: Element,
    MutationObserver: class extends Observer { constructor(callback) { super(callback); mutations.push(this); } },
    ResizeObserver: class extends Observer { constructor(callback) { super(callback); resizes.push(this); } },
    requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; }, cancelAnimationFrame(id) { frames.delete(id); },
    getComputedStyle: () => ({ getPropertyValue: name => ({ '--m-fast': '120ms', '--m-enter': 'ease-out' }[name] ?? '') }),
  };
  const effect = (queue, callback, dependencies) => { const index = cursor++, previous = slots[index]; if (!same(previous?.dependencies, dependencies)) { const slot = slots[index] = { dependencies }; queue.push(() => { previous?.cleanup?.(); if (mounted) slot.cleanup = callback(); }); } };
  const react = { useRef(initialValue) { return slots[cursor++] ??= { current: initialValue }; },
    useCallback(callback, dependencies) { const index = cursor++; if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, callback }; return slots[index].callback; },
    useEffect(callback, dependencies) { effect(effects, callback, dependencies); }, useLayoutEffect(callback, dependencies) { effect(layout, callback, dependencies); } };
  const motion = sourceModule('src/presentation/motion/motion.ts', { 'react-dom': { flushSync: callback => callback() }, '../../utils/projectContinuity': {} }, globals);
  const { useMobileMessageContinuity } = sourceModule('src/features/messages/useMobileMessageContinuity.ts', { react, '../../presentation/motion/motion': motion }, globals);
  let options = { enabled: true, active: true, accountId: 'account-a', conversationId: null, messages: [], isLoadingThread: false, viewerProfileId: 'me', scroller: { current: scroller }, list: { current: list }, threadPanel: { current: threadPanel }, listPanel: { current: listPanel }, isAtBottomRef: { current: true }, preserveScrollRef: { current: false }, markRead: () => marks.push(options.conversationId), setHasNewBelow: value => below.push(value), ...initial };
  function render(changes = {}) {
    options = { ...options, ...changes }; if (!mounted) return api;
    if ('messages' in changes || !scroller.children.length) scroller.children = options.messages.map(message => { const row = new Element(message.id); row.height = 60; row.dataset.messageId = message.id; row.parentElement = content; return row; });
    listPanel.hidden = options.enabled && Boolean(options.conversationId); threadPanel.hidden = options.enabled && !options.conversationId; listPanel.inert = threadPanel.inert = !options.active;
    cursor = 0; effects = []; layout = []; api = useMobileMessageContinuity(options); layout.splice(0).forEach(run => run()); effects.splice(0).forEach(run => run()); return api;
  }
  render();
  return { get options() { return options; }, body, listPanel, threadPanel, list, scroller, opener, composer, document, frames, animations, focuses, marks, below, scrollWrites, events, mediaEvents, mutations, resizes, render,
    open(id = 'a', loaded = messages(30, id), loading = false) { list.scrollTop = 370; list.scrollLeft = 9; opener.focus(); api.rememberOpen(opener); render({ conversationId: id, messages: loaded, isLoadingThread: loading }); },
    close() { render({ conversationId: null, messages: [], isLoadingThread: false }); },
    scroll(top) { scroller.scrollTop = top; options.isAtBottomRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80; emit(scroller.events, 'scroll'); },
    input(type, target = composer) { const event = { type, target, preventDefault() { this.prevented = true; } }; emit(events, type, event); return event; },
    nativeScroll(top) { scroller._top = top; emit(scroller.events, 'scroll'); },
    pop() { emit(events, 'popstate'); },
    paint() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    reduce(value) { reduced = value; emit(mediaEvents, 'change'); },
    appReduce(value) { appReduce = value; mutations.filter(observer => observer.active).forEach(observer => observer.callback()); },
    resize() { resizes.filter(observer => observer.active).forEach(observer => observer.callback()); },
    measure() { rowReads = 0; return () => rowReads; },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
    async flush() { await new Promise(setImmediate); },
  };
}

test('cached MOBILE conversations open immediately, restore their visible message anchor and return inbox scroll before focus', () => {
  const h = fixture(); h.open(); assert.equal(h.animations.length, 0); assert.equal(h.scroller.scrollTop, 1300); assert.equal(h.document.activeElement, h.threadPanel); assert.equal(h.threadPanel.focusOptions.preventScroll, true);
  h.scroll(415); const anchor = h.scroller.children[6].getBoundingClientRect().top; h.list.scrollTop = 0; h.list.scrollLeft = 0; h.close();
  h.paint(); assert.equal(h.document.activeElement, h.opener); assert.equal(h.focuses.at(-1).listTop, 370); assert.equal(h.focuses.at(-1).listLeft, 9);
  h.open(); assert.equal(h.scroller.scrollTop, 415); assert.equal(h.scroller.children[6].getBoundingClientRect().top, anchor); assert.equal(h.options.isAtBottomRef.current, false); assert.equal(h.animations.length, 0); h.unmount();
});

test('uncached loading reveals once after truthful completion; input and retry never restart or delay it', async () => {
  const h = fixture(); h.open('a', [], true); assert.equal(h.animations.length, 0); assert.equal(h.marks.length, 0);
  h.render({ messages: messages(), isLoadingThread: false }); assert.equal(h.animations.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(h.animations[0].options)), { duration: 120, easing: 'ease-out' }); assert.deepEqual(JSON.parse(JSON.stringify(h.animations[0].keyframes)), [{ opacity: 0 }, { opacity: 1 }]);
  h.input('pointerdown'); assert.equal(h.animations[0].cancelled, true); h.render({ isLoadingThread: true }); h.render({ isLoadingThread: false, messages: [...h.options.messages] }); assert.equal(h.animations.length, 1); await h.flush(); h.unmount();
  const interrupted = fixture(); interrupted.open('a', [], true); interrupted.input('wheel'); interrupted.render({ messages: messages(), isLoadingThread: false }); assert.equal(interrupted.animations.length, 0); assert.equal(interrupted.scroller.scrollTop, 0); interrupted.unmount();
});

test('new incoming messages preserve reading position and expose New messages; only new own messages or bottom readers follow', () => {
  const h = fixture(); h.open(); h.scroll(400); const original = h.scroller.scrollTop;
  h.render({ messages: [...h.options.messages, ...messages(1, 'incoming')] }); assert.equal(h.scroller.scrollTop, original); assert.equal(h.below.at(-1), true); assert.equal(h.options.isAtBottomRef.current, false);
  h.render({ messages: [...h.options.messages, ...messages(1, 'own', 'me')] }); assert.equal(h.scroller.scrollTop, h.scroller.scrollHeight - h.scroller.clientHeight); assert.equal(h.below.at(-1), false);
  h.scroll(500); h.render({ messages: [...h.options.messages] }); assert.equal(h.scroller.scrollTop, 500, 'Refreshing an existing own last message cannot jump back to bottom.');
  h.scroll(h.scroller.scrollHeight); h.render({ messages: [...h.options.messages, ...messages(1, 'next')] }); assert.equal(h.scroller.scrollTop, h.scroller.scrollHeight - h.scroller.clientHeight); assert.equal(h.marks.at(-1), 'a'); h.unmount();
});

test('refresh and image reflow retain an away-from-bottom anchor, with bounded message geometry work', () => {
  const h = fixture(); h.open('a', messages(1500)); h.scroll(45010); const reads = h.measure();
  h.scroll(45011); assert.ok(reads() <= 14, `Only bounded anchor reads are allowed, got ${reads()}`);
  const anchor = h.scroller.children.find(row => row.getBoundingClientRect().bottom > 100), before = anchor.getBoundingClientRect().top;
  h.scroller.children[0].height += 180; h.resize(); assert.equal(anchor.getBoundingClientRect().top, before); assert.equal(h.scroller.scrollTop, 45191);
  h.options.preserveScrollRef.current = true; const top = h.scroller.scrollTop; h.scroller.children[0].height += 100; h.resize(); assert.equal(h.scroller.scrollTop, top, 'Earlier-message compensation retains ownership.'); h.unmount();
});

test('failure and Retry geometry cannot replace the reading anchor with a native resize scroll snapshot', () => {
  const h = fixture(); h.open(); h.scroll(415); const anchor = h.scroller.children[6], offset = anchor.getBoundingClientRect().top;
  assert.equal(h.scroller.style.overflowAnchor, 'none');
  h.scroller.padding = 24; h.scroller.height -= 85; h.nativeScroll(324); h.resize();
  assert.equal(anchor.getBoundingClientRect().top, offset); assert.equal(h.scroller.scrollTop, 439);
  h.input('pointerdown'); h.scroller.padding = 0; h.scroller.height += 85; h.nativeScroll(530); h.resize();
  assert.equal(anchor.getBoundingClientRect().top, offset); assert.equal(h.scroller.scrollTop, 415);
  h.render({ enabled: false }); assert.equal(h.scroller.style.overflowAnchor, 'auto'); h.unmount();
});

test('same-open refresh compensates layout before saving, while a new deliberate scroll retains ownership', () => {
  const h = fixture(); h.open(); h.scroll(415); const offset = h.scroller.children[6].getBoundingClientRect().top;
  h.scroller.padding = 24; h.render({ messages: [...h.options.messages] }); assert.equal(h.scroller.children[6].getBoundingClientRect().top, offset); assert.equal(h.scroller.scrollTop, 439);
  h.scroller.padding += 10; h.input('wheel', h.scroller); h.scroll(600); h.resize(); assert.equal(h.scroller.scrollTop, 600, 'An actual scroll after geometry changed owns the new reading position.'); h.unmount();
});

test('the existing keyboard owner can move its viewport without continuity fighting or replacing the saved reading', () => {
  const h = fixture(); h.open(); h.scroll(415); h.composer.focus({ preventScroll: true });
  h.scroller.height = 300; h.nativeScroll(1000); h.render({ messages: [...h.options.messages] }); h.resize(); assert.equal(h.scroller.scrollTop, 1000);
  h.scroller.height = 500; h.document.activeElement = h.threadPanel; h.nativeScroll(415); h.resize(); assert.equal(h.scroller.scrollTop, 415); h.close(); h.open(); assert.equal(h.scroller.scrollTop, 415); h.unmount();
});

test('a real scroll while the composer is focused saves the latest reading for Back and reopen', () => {
  for (const type of ['wheel', 'touchstart']) {
    const h = fixture(); h.open(); h.scroll(415); h.composer.focus({ preventScroll: true });
    h.input(type, h.scroller); h.scroll(600); h.scroll(650); h.scroll(700); h.resize(); assert.equal(h.scroller.scrollTop, 700);
    h.scroller.height = 300; h.nativeScroll(1000); h.resize(); h.scroller.height = 500; h.document.activeElement = h.threadPanel; h.nativeScroll(700);
    h.close(); h.paint(); h.open(); assert.equal(h.scroller.scrollTop, 700, type); assert.equal(h.options.isAtBottomRef.current, false); h.unmount();
  }
});

test('Earlier messages preserves the latest user reading anchor while its request was pending', () => {
  const h = fixture(); h.open(); h.scroll(415); const original = h.options.messages;
  h.options.preserveScrollRef.current = true; h.scroll(500); const visible = h.scroller.children[8].getBoundingClientRect().top;
  h.render({ messages: [...messages(5, 'older'), ...original] });
  assert.equal(h.scroller.scrollTop, 800); assert.equal(h.scroller.children[13].getBoundingClientRect().top, visible); assert.equal(h.options.isAtBottomRef.current, false);
  h.options.preserveScrollRef.current = false; h.render(); assert.equal(h.scroller.scrollTop, 800); h.unmount();
  const bottom = fixture(); bottom.open(); bottom.options.preserveScrollRef.current = true; bottom.render({ messages: [...messages(5, 'older'), ...bottom.options.messages] });
  assert.equal(bottom.scroller.scrollTop, 1600, 'A reader at the bottom keeps the same last visible messages after a prepend.'); bottom.unmount();
});

test('native Back restores an eligible inbox opener; missing, offscreen and interrupted origins never steal focus', () => {
  const native = fixture(); native.open(); native.scroll(220); native.pop(); native.close(); native.paint(); assert.equal(native.document.activeElement, native.opener); native.unmount();
  for (const reason of ['direct', 'missing', 'offscreen', 'input', 'modal', 'other-focus']) {
    const h = fixture();
    if (reason === 'direct') h.render({ conversationId: 'a', messages: messages() }); else h.open();
    h.close(); if (reason === 'missing') h.listPanel.isConnected = false;
    if (reason === 'offscreen') h.opener.getBoundingClientRect = () => ({ top: 2000, bottom: 2044 });
    if (reason === 'input') h.input('keydown'); if (reason === 'modal') h.document.modal = {};
    if (reason === 'other-focus') h.document.activeElement = { elsewhere: true };
    h.paint(); if (reason === 'offscreen') assert.equal(h.document.activeElement, h.listPanel); else assert.notEqual(h.document.activeElement, h.opener, reason); h.unmount();
  }
});

test('every native input interruption cancels a live reveal without cancelling its interaction', async () => {
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'popstate']) {
    const h = fixture(); h.open('a', [], true); h.render({ messages: messages(), isLoadingThread: false });
    const event = h.input(type); assert.equal(h.animations[0].cancelled, true); assert.equal(event.prevented, undefined); await h.flush(); h.unmount();
  }
});

test('app and OS Reduce Motion skip new reveals and cancel active reveals', async () => {
  for (const preference of ['app', 'os']) {
    const h = fixture(); if (preference === 'app') h.appReduce(true); else h.reduce(true);
    h.open('a', [], true); h.render({ messages: messages(), isLoadingThread: false }); assert.equal(h.animations.length, 0); h.unmount();
    const active = fixture(); active.open('a', [], true); active.render({ messages: messages(), isLoadingThread: false }); if (preference === 'app') active.appReduce(true); else active.reduce(true);
    assert.equal(active.animations[0].cancelled, true); await active.flush(); active.unmount();
  }
  const scoped = fixture(); assert.equal(scoped.mutations[0].nodes.length, 2); assert.equal(scoped.mutations[0].settings.some(settings => settings.subtree), false); scoped.unmount();
});

test('loading cannot mark an unread thread early or steal focus from its request composer', () => {
  const h = fixture(); h.options.preserveScrollRef.current = true; h.open('a', [], true);
  assert.equal(h.options.isAtBottomRef.current, false); assert.equal(h.options.preserveScrollRef.current, false); assert.equal(h.marks.length, 0);
  h.composer.focus({ preventScroll: true }); const focuses = h.focuses.length; h.render({ messages: messages(), isLoadingThread: false });
  assert.equal(h.document.activeElement, h.composer); assert.equal(h.focuses.length, focuses); assert.equal(h.scroller.scrollTop, 1300); h.unmount();
});

test('near-bottom positions return exactly and missing anchors fall back to their saved offset', () => {
  const near = fixture(); near.open(); near.scroll(1250); near.close(); near.open(); near.resize(); assert.equal(near.scroller.scrollTop, 1250); near.unmount();
  const missing = fixture(); missing.open(); missing.scroll(415); missing.close(); missing.open('a', messages(30, 'replacement')); assert.equal(missing.scroller.scrollTop, 415); missing.unmount();
});

test('a local outgoing acknowledgement is not a new own message and cannot disturb a reader', () => {
  const h = fixture(); const original = [...messages(30), ...messages(1, 'local', 'me')]; h.open('a', original); h.scroll(420);
  h.render({ messages: [...original.slice(0, -1), ...messages(1, 'confirmed', 'me')] }); assert.equal(h.scroller.scrollTop, 420); assert.notEqual(h.below.at(-1), true); h.unmount();
});

test('retained inactive screens restore reading on reactivation without late scroll, focus, reveal or account leakage', async () => {
  const h = fixture(); h.open(); h.scroll(410); h.render({ active: false }); const focus = h.focuses.length;
  h.scroller._top = 0; h.render({ messages: [...h.options.messages, ...messages(1, 'late')] }); h.resize(); h.paint(); assert.equal(h.scroller.scrollTop, 0); assert.equal(h.focuses.length, focus);
  h.render({ active: true }); assert.equal(h.scroller.scrollTop, 410); assert.equal(h.animations.length, 0);
  h.render({ accountId: 'account-b', messages: messages(30, 'b') }); assert.equal(h.scroller.scrollTop, 1300); h.close(); h.paint(); assert.notEqual(h.document.activeElement, h.opener); h.unmount(); await h.flush();
});

test('a retained screen hidden before layout cleanup cannot replace a reading anchor with zero geometry', () => {
  const h = fixture(); h.open(); h.scroll(410); h.scroller.zeroGeometry = true; h.scroller._top = 0;
  h.render({ active: false }); assert.equal(h.scroller.clientHeight, 0); assert.equal(h.scroller.scrollHeight, 0);
  h.scroller.zeroGeometry = false; h.render({ active: true }); assert.equal(h.scroller.scrollTop, 410); assert.equal(h.options.isAtBottomRef.current, false); h.unmount();
});

test('WEB is inert and a WEB to MOBILE presentation change keeps the current reading position', () => {
  const h = fixture({ enabled: false, conversationId: 'a', messages: messages() }); h.scroller._top = 380; const count = h.scrollWrites.length;
  h.render({ messages: [...h.options.messages] }); assert.equal(h.scrollWrites.length, count); assert.equal(h.animations.length, 0); assert.equal(h.focuses.length, 0); assert.equal(h.events.size, 0); assert.equal(h.marks.length, 0);
  h.render({ enabled: true }); assert.equal(h.scroller.scrollTop, 380); assert.equal(h.animations.length, 0); h.render({ enabled: false }); h.resize(); h.paint(); assert.equal(h.scroller.scrollTop, 380); h.unmount();
});

test('rapid conversation reversal and unmount reject stale animation promises, resize callbacks and focus frames', async () => {
  const h = fixture(); h.open('a', [], true); h.render({ messages: messages(), isLoadingThread: false }); const first = h.animations[0], resize = h.resizes.find(observer => observer.active);
  h.open('b', [], true); assert.equal(first.cancelled, true); h.render({ messages: messages(30, 'b'), isLoadingThread: false }); const second = h.animations[1]; first.fail(); await h.flush(); assert.notEqual(second.cancelled, true);
  h.close(); const focus = h.focuses.length; h.unmount(); h.paint(); resize.callback(); second.fail(); await h.flush(); assert.equal(h.focuses.length, focus); assert.equal(h.frames.size, 0); assert.equal(h.events.size, 0); assert.equal(h.mediaEvents.size, 0); assert.equal(h.mutations.some(observer => observer.active), false); assert.equal(h.resizes.some(observer => observer.active), false);
});
