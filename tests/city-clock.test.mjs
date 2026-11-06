import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

function fixture(epoch = Date.UTC(2026, 0, 15, 12)) {
  const slots = [], pending = [], timers = new Map(), listeners = new Map();
  let cursor = 0, clock = 0, id = 0, reducedMotion = false;
  class ClockDate extends Date { constructor(value = epoch + clock) { super(value); } static now() { return epoch + clock; } }
  const document = { visibilityState: 'visible', addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); } };
  const window = { setInterval(fn, delay) { const key = ++id; timers.set(key, { fn, delay, at: clock + delay }); return key; }, clearInterval: key => timers.delete(key) };
  const hooks = { ...React,
    useState(initial) { const key = cursor++; if (!(key in slots)) slots[key] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[key].value, next => { slots[key].value = typeof next === 'function' ? next(slots[key].value) : next; }]; },
    useEffect(fn, deps) { const key = cursor++, old = slots[key]; if (!old || deps.some((value, index) => value !== old.deps[index])) { slots[key] = { deps }; pending.push(() => { old?.cleanup?.(); slots[key].cleanup = fn(); }); } },
  };
  const { CityClock } = sourceModule('src/components/auth/CityClock.tsx', { react: hooks, 'framer-motion': { useReducedMotion: () => reducedMotion } }, { document, window, Date: ClockDate });
  const render = () => { cursor = 0; const tree = CityClock(); pending.splice(0).forEach(fn => fn()); return tree; };
  const reading = () => {
    const p = render().props.children[0], visible = p.props.children[1], time = visible.props.children[2];
    return { city: visible.props.children[0], time: time.props.children.replace(/\s+/g, ' '), dateTime: time.props.dateTime };
  };
  return { render, reading, timers, listeners,
    advance(ms) { const end = clock + ms; while (true) { const next = [...timers.values()].sort((a,b) => a.at-b.at)[0]; if (!next || next.at > end) break; clock = next.at; next.at += next.delay; next.fn(); } clock = end; },
    visible(value) { document.visibilityState = value ? 'visible' : 'hidden'; listeners.get('visibilitychange')?.(); },
    reduce(value) { reducedMotion = value; render(); },
    close() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test('nine city clocks switch exactly every five seconds and loop', () => {
  const h = fixture(), first = h.reading();
  assert.equal(first.city, 'San Francisco'); assert.equal(first.time, '4:00 AM');
  h.advance(4_999); assert.equal(h.reading().city, first.city);
  h.advance(1); assert.equal(h.reading().city, 'New York'); assert.equal(h.reading().time, '7:00 AM');
  const expected = [['London','12:00 PM'],['Paris','1:00 PM'],['Dubai','4:00 PM'],['Mumbai','5:30 PM'],['Singapore','8:00 PM'],['Tokyo','9:00 PM'],['Sydney','11:00 PM']];
  for (const [city,time] of expected) { h.advance(5_000); assert.equal(h.reading().city,city); assert.equal(h.reading().time,time); }
  h.advance(5_000); assert.equal(h.reading().city,first.city); h.close();
});

test('local times follow summer daylight saving rather than fixed UTC offsets', () => {
  const h = fixture(Date.UTC(2026,6,15,12));
  assert.equal(h.reading().time,'5:00 AM'); h.advance(5_000); assert.equal(h.reading().time,'8:00 AM');
  h.advance(5_000); assert.equal(h.reading().time,'1:00 PM');
  h.advance(30_000); assert.equal(h.reading().city,'Sydney'); assert.equal(h.reading().time,'10:00 PM'); h.close();
});

test('minute rollover remains live while city rotation is paused', () => {
  const h = fixture(Date.UTC(2026,0,15,12,59,59));
  assert.equal(h.reading().time,'4:59 AM');
  h.render().props.children[1].props.onClick(); h.render();
  h.advance(1_000); assert.equal(h.reading().city,'San Francisco'); assert.equal(h.reading().time,'5:00 AM');
  assert.equal(h.reading().dateTime,'2026-01-15T13:00:00.000Z');
  h.advance(60_000); assert.equal(h.reading().time,'5:01 AM'); assert.equal(h.timers.size,1); h.close();
});

test('hidden clocks stop timers and resume with fresh time and a full five-second city interval', () => {
  const h = fixture(); const first = h.reading(); h.advance(2_000); h.visible(false); h.advance(120_000);
  assert.equal(h.timers.size,0); assert.equal(h.reading().city,first.city);
  h.visible(true); assert.equal(h.reading().time,'4:02 AM'); h.advance(4_999); assert.equal(h.reading().city,first.city);
  h.advance(1); assert.equal(h.reading().city,'New York'); h.close(); assert.equal(h.timers.size,0); assert.equal(h.listeners.size,0);
});

test('reduced motion holds the city while its time remains current; resume retains rotation', () => {
  const h = fixture(); h.reading(); h.reduce(true); h.advance(60_000);
  assert.equal(h.reading().city,'San Francisco'); assert.equal(h.reading().time,'4:01 AM'); assert.equal(h.render().props.children[1],false);
  h.reduce(false); h.advance(5_000); assert.equal(h.reading().city,'New York'); h.close();
});

test('reserved lines are hidden and changing times do not announce every tick', () => {
  const h = fixture(), tree = h.render(), paragraph = tree.props.children[0];
  assert.equal(paragraph.props['aria-live'],'off'); assert.equal(paragraph.props.children[0].length,9);
  assert.ok(paragraph.props.children[0].every(span => span.props['aria-hidden'] === 'true'));
  assert.equal(tree.props.children[1].props.children,'Pause changing cities'); h.close();
});
