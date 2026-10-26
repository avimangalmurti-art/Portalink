import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

function fixture() {
  const slots = [], pending = [], timers = new Map(), listeners = new Map();
  let cursor = 0, clock = 0, nextTimer = 0, reducedMotion = false;
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const window = {
    setInterval(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay, at: clock + delay }); return id; },
    clearInterval: id => timers.delete(id),
  };
  const hooks = { ...React,
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { value: initial };
      return [slots[slot].value, next => { slots[slot].value = typeof next === 'function' ? next(slots[slot].value) : next; }];
    },
    useEffect(fn, deps) {
      const slot = cursor++, previous = slots[slot];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        slots[slot] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[slot].cleanup = fn(); });
      }
    },
  };
  const { CreativeThought } = sourceModule('src/components/auth/CreativeThought.tsx', {
    react: hooks, 'framer-motion': { useReducedMotion: () => reducedMotion },
  }, { document, window });
  const render = () => { cursor = 0; const tree = CreativeThought(); pending.splice(0).forEach(fn => fn()); return tree; };
  return {
    render, timers, listeners,
    message: () => render().props.children[0].props.children[1].props.children,
    reduce(value) { reducedMotion = value; render(); },
    visible(value) { document.visibilityState = value ? 'visible' : 'hidden'; listeners.get('visibilitychange')?.(); },
    advance(ms) {
      const end = clock + ms;
      while (true) {
        const next = [...timers.values()].sort((a, b) => a.at - b.at)[0];
        if (!next || next.at > end) break;
        clock = next.at; next.at += next.delay; next.fn();
      }
      clock = end;
    },
    close() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test('18 distinct first-person thoughts each remain for 20 seconds and loop to the first', () => {
  const h = fixture(), first = h.message(), seen = new Set([first]);
  h.advance(19_999); assert.equal(h.message(), first);
  h.advance(1); assert.notEqual(h.message(), first); seen.add(h.message());
  for (let index = 2; index < 18; index++) { h.advance(20_000); seen.add(h.message()); }
  assert.equal(seen.size, 18);
  assert.ok([...seen].every(thought => thought.startsWith('I can ')));
  h.advance(20_000); assert.equal(h.message(), first);
  h.close();
});

test('hidden pages suspend rotation, resume with a full reading interval, and clean up on exit', () => {
  const h = fixture(), first = h.message();
  h.advance(8_000); h.visible(false); h.advance(200_000);
  assert.equal(h.message(), first); assert.equal(h.timers.size, 0);
  h.visible(true); h.advance(19_999); assert.equal(h.message(), first);
  h.advance(1); assert.notEqual(h.message(), first);
  h.close(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test('readers can pause and resume; reduced motion holds the current thought without a timer', () => {
  const h = fixture(), first = h.message();
  let button = h.render().props.children[1];
  assert.equal(button.props.children, 'Pause changing thoughts'); button.props.onClick();
  button = h.render().props.children[1]; assert.equal(button.props['aria-pressed'], true);
  h.advance(40_000); assert.equal(h.message(), first);
  button.props.onClick(); h.render(); h.advance(20_000);
  const second = h.message(); assert.notEqual(second, first);
  h.reduce(true); h.advance(40_000); assert.equal(h.message(), second);
  assert.equal(h.timers.size, 0); assert.equal(h.render().props.children[1], false);
  h.reduce(false); h.advance(20_000); assert.notEqual(h.message(), second);
  h.close();
});

test('reserved text is hidden from assistive technology and settled changes do not interrupt reading', () => {
  const h = fixture(), paragraph = h.render().props.children[0];
  assert.equal(paragraph.props['aria-live'], 'off');
  const spaces = paragraph.props.children[0];
  assert.equal(spaces.length, 18);
  assert.ok(spaces.every(span => span.props['aria-hidden'] === 'true'));
  assert.equal(paragraph.props.children[1].props.children, spaces[0].props.children);
  h.close();
});
