import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

function eventTarget(values = {}) {
  const listeners = new Map();
  return Object.assign(values, {
    listeners,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
    emit(name) { listeners.get(name)?.(); },
  });
}

/** Actual hook with DOM geometry/events simulated; no browser or auth service. */
function harness({ enabled = true, missingRoot = false, visualViewport = true, width = 420, height = 912, offsetTop = 0, paddingTop = 20, scrollTop = 80, actionsTop = 200 } = {}) {
  const frames = new Map(), timers = new Map(), styles = new Map(), attributes = new Map();
  let nextFrame = 0, nextTimer = 0, previousDeps, cleanup;
  let focusCalls = 0, selectionCalls = 0;
  const document = { activeElement: null };
  class Element {
    constructor(kind = 'input', options = {}) {
      this.kind = kind; this.id = options.id ?? 'field'; this.inForm = options.inForm ?? true;
      this.selectionStart = 3; this.selectionEnd = 7; this.selectionDirection = 'backward';
      this.value = 'A creator'; this.connected = true;
      this.setBounds(options.top ?? 240, options.bottom ?? 284);
    }
    setBounds(top, bottom) { this.top = top + root.scrollTop; this.bottom = bottom + root.scrollTop; }
    getBoundingClientRect() { return { top: this.top - root.scrollTop, bottom: this.bottom - root.scrollTop }; }
    matches() { return ['input', 'textarea', 'select'].includes(this.kind); }
    closest(selector) { return selector === '.entry-inline-form' && this.inForm ? form : null; }
    focus() { focusCalls++; document.activeElement = this; }
    setSelectionRange() { selectionCalls++; }
  }
  const form = {}, fields = new Set(), labels = [];
  const root = eventTarget({
    scrollTop,
    bounds: { top: offsetTop, bottom: offsetTop + height },
    getBoundingClientRect() { return this.bounds; },
    contains(element) { return fields.has(element); },
    querySelector(selector) { return selector === '.mobile-share-landing-actions' ? actions : null; },
    querySelectorAll(selector) { return selector === 'label' ? labels : []; },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    style: {
      setProperty(name, value) { styles.set(name, value); },
      removeProperty(name) { styles.delete(name); },
    },
  });
  const actions = { top: actionsTop, getBoundingClientRect() { return { top: this.top }; } };
  const viewport = visualViewport ? eventTarget({ height, offsetTop }) : null;
  const window = eventTarget({
    innerWidth: width,
    innerHeight: height,
    visualViewport: viewport,
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const ref = { current: missingRoot ? null : root };
  const api = sourceModule('src/components/auth/useEntryFieldViewport.ts', {
    react: {
      useEffect(effect, deps) {
        if (!previousDeps || deps.some((value, i) => value !== previousDeps[i])) {
          cleanup?.(); previousDeps = deps; cleanup = effect();
        }
      },
    },
  }, {
    window, document, HTMLElement: Element,
    getComputedStyle: () => ({ paddingTop: `${paddingTop}px` }),
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const render = (nextEnabled = enabled) => { enabled = nextEnabled; api.useEntryFieldViewport(ref, enabled); };
  render();
  return {
    root, actions, viewport, window, document, ref, frames, timers, styles, attributes,
    render,
    field(options = {}) { const field = new Element(options.kind, options); fields.add(field); return field; },
    label(field, top) {
      const label = new Element('label', { top, bottom: top + 20 }); label.htmlFor = field.id; labels.push(label); return label;
    },
    focus(field) { document.activeElement = field; root.emit('focusin'); },
    blur() { document.activeElement = null; root.emit('focusout'); },
    flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
    resize(nextHeight, nextTop = viewport?.offsetTop ?? 0) {
      root.bounds = { top: nextTop, bottom: nextTop + nextHeight };
      if (viewport) { viewport.height = nextHeight; viewport.offsetTop = nextTop; viewport.emit('resize'); }
      else { window.innerHeight = nextHeight; window.emit('resize'); }
    },
    unmount() { cleanup?.(); cleanup = undefined; },
    get focusCalls() { return focusCalls; },
    get selectionCalls() { return selectionCalls; },
  };
}

test('focusing a visible field freezes the original inset without refocusing or changing selection', () => {
  const h = harness({ height: 912, offsetTop: 40, actionsTop: 240 }), field = h.field();
  h.label(field, 214); const selection = [field.selectionStart, field.selectionEnd, field.selectionDirection];
  h.focus(field);
  assert.equal(h.attributes.get('data-entry-editing'), 'true');
  assert.equal(h.styles.get('--entry-editing-inset'), '260px');
  h.flushFrames(); assert.equal(h.root.scrollTop, 80);
  h.actions.top = 340; field.value += ' A'; h.render();
  assert.equal(h.frames.size, 0); assert.equal(h.styles.get('--entry-editing-inset'), '260px');
  h.resize(600, 70); h.flushFrames();
  assert.equal(h.styles.get('--entry-editing-inset'), '260px'); assert.equal(h.root.scrollTop, 80);
  assert.equal(h.document.activeElement, field);
  assert.deepEqual([field.selectionStart, field.selectionEnd, field.selectionDirection], selection);
  assert.equal(h.focusCalls, 0); assert.equal(h.selectionCalls, 0); h.unmount();
});

test('keyboard resize and offset reveal the lower input edge by only the obscured distance', () => {
  const h = harness(), field = h.field({ top: 430, bottom: 474 }); h.label(field, 410);
  h.focus(field); h.flushFrames(); assert.equal(h.root.scrollTop, 80);
  h.resize(400, 50); h.flushFrames();
  assert.equal(h.root.scrollTop, 120); assert.equal(field.getBoundingClientRect().bottom, 434);
  assert.equal(h.document.activeElement, field); assert.equal(h.focusCalls, 0); h.unmount();
});

test('a clipped label and input are revealed together when their combined area fits', () => {
  const h = harness({ height: 440, offsetTop: 60 }), field = h.field({ top: 80, bottom: 124 }); h.label(field, 50);
  h.focus(field); h.flushFrames();
  assert.equal(h.root.scrollTop, 54, 'Only the 26px clipped label margin is corrected');
  assert.equal(field.getBoundingClientRect().top, 106); h.unmount();
});

test('the editable area takes priority when enlarged label spacing cannot fit', () => {
  const h = harness({ height: 300 }), field = h.field({ top: 300, bottom: 344 }); h.label(field, -100);
  h.focus(field); h.flushFrames();
  assert.equal(h.root.scrollTop, 140); assert.equal(field.getBoundingClientRect().bottom, 284); h.unmount();
});

test('typing, input events, manual scroll and ordinary rerenders do not schedule viewport work', () => {
  const h = harness(), field = h.field(); h.focus(field); h.flushFrames();
  field.value = 'A different creator'; field.selectionStart = 4; field.selectionEnd = 4;
  h.root.emit('input'); h.root.scrollTop = 125; h.root.emit('scroll'); h.viewport.emit('scroll'); h.render();
  assert.equal(h.frames.size, 0); assert.equal(h.root.scrollTop, 125);
  assert.equal(h.document.activeElement, field); assert.equal(field.selectionStart, 4); assert.equal(field.selectionEnd, 4);
  assert.equal(h.focusCalls, 0); assert.equal(h.selectionCalls, 0); h.unmount();
});

test('wheel, touch movement and caret pointer input cancel queued and future correction until another field is focused', () => {
  for (const gesture of ['wheel', 'touchmove', 'pointerdown']) {
    const h = harness(), first = h.field({ id: 'first', top: 720, bottom: 764 });
    h.focus(first); assert.equal(h.frames.size, 1);
    h.root.emit(gesture); assert.equal(h.frames.size, 0);
    h.resize(400); assert.equal(h.frames.size, 0); assert.equal(h.root.scrollTop, 80);
    first.selectionStart = 1; first.selectionEnd = 5; h.root.emit('input'); h.flushFrames();
    assert.equal(h.root.scrollTop, 80); assert.equal(first.selectionStart, 1); assert.equal(first.selectionEnd, 5);
    const second = h.field({ id: 'second', top: 450, bottom: 494 }); h.focus(second); h.flushFrames();
    assert.equal(h.root.scrollTop, 190, `${gesture}: a newly selected field can reveal its 110px obscured edge`);
    assert.equal(h.document.activeElement, second); h.unmount();
  }
});

test('blur retains the stable layout until the keyboard restores, then releases the editing inset', () => {
  const h = harness(), field = h.field(); h.focus(field); h.flushFrames(); h.resize(420); h.flushFrames();
  const inset = h.styles.get('--entry-editing-inset');
  h.root.emit('wheel'); h.blur(); h.flushTimers();
  assert.equal(h.attributes.get('data-entry-editing'), 'true'); assert.equal(h.styles.get('--entry-editing-inset'), inset);
  h.resize(700); assert.equal(h.attributes.get('data-entry-editing'), 'true');
  h.resize(912); assert.equal(h.attributes.has('data-entry-editing'), false); assert.equal(h.styles.has('--entry-editing-inset'), false);
  h.actions.top = 300; h.focus(field); assert.equal(h.styles.get('--entry-editing-inset'), '360px'); h.unmount();
});

test('switching between editable fields preserves the existing layout and cancels a pending blur reset', () => {
  const h = harness(), first = h.field({ id: 'name' }), second = h.field({ id: 'email', top: 340, bottom: 384 });
  h.focus(first); h.flushFrames(); const inset = h.styles.get('--entry-editing-inset');
  h.blur(); assert.equal(h.timers.size, 1); h.actions.top = 300; h.focus(second);
  assert.equal(h.timers.size, 0); h.flushFrames();
  assert.equal(h.styles.get('--entry-editing-inset'), inset); assert.equal(h.document.activeElement, second); h.unmount();
});

test('rotation rebases the keyboard-restored height without leaving a stale portrait inset', () => {
  const h = harness({ width: 420, height: 912 }), field = h.field();
  h.focus(field); h.flushFrames(); h.resize(420); h.flushFrames();
  assert.equal(h.attributes.get('data-entry-editing'), 'true');
  assert.equal(h.window.innerHeight, 912, 'A height-only keyboard resize does not change the layout-height reference');
  h.window.innerWidth = 912; h.window.innerHeight = 420; h.resize(220); h.flushFrames();
  h.blur(); h.flushTimers(); assert.equal(h.attributes.get('data-entry-editing'), 'true', 'Landscape keyboard remains open');
  h.resize(420); assert.equal(h.attributes.has('data-entry-editing'), false);
  assert.equal(h.styles.has('--entry-editing-inset'), false, 'Keyboard closure releases the inset at the new landscape height');
  h.unmount();
});

test('fields outside the inline form and buttons such as password reveal do not claim focus or select text', () => {
  const h = harness(), outside = h.field({ inForm: false }), button = h.field({ kind: 'button', id: 'reveal' });
  h.focus(outside); h.focus(button); assert.equal(h.frames.size, 0); assert.equal(h.attributes.size, 0);
  assert.equal(h.document.activeElement, button); assert.equal(h.focusCalls, 0); assert.equal(h.selectionCalls, 0); h.unmount();
});

test('disabled and absent-root scenes add no listeners or layout changes', () => {
  for (const options of [{ enabled: false }, { missingRoot: true }]) {
    const h = harness(options); assert.equal(h.root.listeners.size, 0); assert.equal(h.viewport.listeners.size, 0);
    assert.equal(h.window.listeners.size, 0); assert.equal(h.attributes.size, 0); assert.equal(h.styles.size, 0); h.unmount();
  }
});

test('window resize provides the same minimal correction without VisualViewport', () => {
  const h = harness({ visualViewport: false }), field = h.field({ top: 450, bottom: 494 });
  h.focus(field); h.flushFrames(); h.resize(400); h.flushFrames();
  assert.equal(h.root.scrollTop, 190); assert.equal(h.focusCalls, 0); h.unmount();
});

test('disabling or unmounting cancels pending work and removes every owned listener, attribute and inset', () => {
  for (const disable of [true, false]) {
    const h = harness(), field = h.field(); h.focus(field); h.blur();
    assert.equal(h.frames.size, 1); assert.equal(h.timers.size, 1);
    if (disable) h.render(false); else h.unmount();
    assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.root.listeners.size, 0);
    assert.equal(h.viewport.listeners.size, 0); assert.equal(h.window.listeners.size, 0);
    assert.equal(h.attributes.size, 0); assert.equal(h.styles.size, 0); h.unmount();
  }
});
