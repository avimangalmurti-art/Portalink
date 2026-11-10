import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function harness(nativeScrollEnd = false) {
  let effect, cleanup, deps, modal = false, focusVisible = false, editor = false, now = 0, serial = 0;
  const listeners = new Map(), timers = new Map();
  class Element {
    constructor(excluded = false) { this.excluded = excluded; this.scrollTop = this.scrollLeft = 0; this.scrollHeight = 2000; this.clientHeight = 600; this.scrollWidth = this.clientWidth = 390; if(nativeScrollEnd) this.onscrollend=null; }
    closest(selector) { return this.excluded && selector.split(', ').includes(this.excluded) ? this : null; }
  }
  const frame = { contains: target => target instanceof Element };
  const dock = { inert: false, attrs: new Map(), closest: () => frame, querySelector: () => focusVisible,
    setAttribute(k,v) { this.attrs.set(k,v); }, removeAttribute(k) { this.attrs.delete(k); } };
  const ref = { current: dock }, exports = {};
  const document = { scrollingElement: new Element(), querySelector: () => modal, activeElement: { matches: () => editor },
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type, fn) { assert.equal(listeners.get(type),fn); listeners.delete(type); } };
  if(nativeScrollEnd) document.onscrollend=null;
  const settling = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/navigationScrollSettling.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: settling });
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useMobileDockScroll.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, HTMLElement: Element,
    window: { setTimeout(fn, delay) { const id = ++serial; timers.set(id, {fn, at:now+delay}); return id; }, clearTimeout(id) { timers.delete(id); } },
    document,
    require: name => name === './navigationScrollSettling' ? settling : { useEffect(fn,next) { if (!deps || next.some((v,i)=>v!==deps[i])) { effect=fn; deps=next; } } },
  });
  return { dock, timers, listeners, Element, document,
    render(enabled = true, path = '/') { exports.useMobileDockScroll(enabled,path,ref); if(effect) {cleanup?.(); cleanup=effect(); effect=null;} },
    get hidden() { return dock.attrs.has('data-scrolling'); },
    emit(type, target = new Element(), extra = {}) { listeners.get(type)?.({target,timeStamp:now,deltaY:20,deltaX:0,isPrimary:true,button:0,pointerId:1,clientX:100,clientY:100,...extra}); },
    tick(ms) { now+=ms; for(const [id,t] of timers) if(t.at<=now) {timers.delete(id);t.fn();} },
    scroll(target, top, elapsed = 16, left = 0) { this.tick(elapsed); const owner=target===document?document.scrollingElement:target; owner.scrollTop=top; owner.scrollLeft=left; this.emit('scroll',target); },
    modal(v) {modal=v;}, focus(v) {focusVisible=v;}, editor(v) {editor=v;}, unmount() {cleanup?.();},
  };
}
const hide = h => { h.emit('wheel'); h.emit('scroll'); assert.equal(h.hidden,true); };

test('actual nested content scrolling hides the dock through momentum and restores it after idle', () => {
  const h=harness(); h.render(); h.emit('scroll'); assert.equal(h.hidden,false);
  h.emit('wheel'); assert.equal(h.hidden,false,'No movement means no hiding');
  h.emit('scroll'); assert.equal(h.hidden,true); assert.equal(h.dock.inert,true); assert.equal(h.dock.attrs.get('aria-hidden'),'true');
  h.tick(50); h.emit('scroll'); h.tick(99); assert.equal(h.hidden,true,'Ongoing momentum resets the fallback');
  h.tick(1); assert.equal(h.hidden,false); assert.equal(h.dock.inert,false); assert.equal(h.dock.attrs.size,0);
  h.emit('scroll'); assert.equal(h.hidden,false,'Restored position without another gesture stays visible'); h.unmount();
});
test('scrollend restores document and nested scrolling immediately, ignoring unrelated scrollers', () => {
  const h=harness(true); h.render();
  for (const target of [h.document, new h.Element()]) {
    h.emit('wheel'); h.emit('scroll',target); assert.equal(h.hidden,true);
    h.tick(1000); assert.equal(h.hidden,true,'A paused gesture waits for its actual end');
    h.emit('scrollend',new h.Element()); assert.equal(h.hidden,true);
    h.emit('scrollend',target);
    assert.equal(h.hidden,false); assert.equal(h.dock.inert,false); assert.equal(h.timers.size,0);
    h.emit('scroll',target); assert.equal(h.hidden,false,'Restored positions do not hide navigation again');
  }
  h.unmount();
});
test('phone panning survives native pointer cancellation, while pinch cannot arm hiding', () => {
  const h=harness(); h.render(); h.emit('pointerdown'); h.emit('pointermove',undefined,{clientY:120}); h.emit('pointercancel'); h.emit('scroll');
  assert.equal(h.hidden,true); h.tick(100);
  h.emit('pointerdown'); h.emit('pointerdown',undefined,{isPrimary:false,pointerId:2}); h.emit('pointercancel'); h.emit('scroll'); assert.equal(h.hidden,false);
  h.emit('wheel',undefined,{ctrlKey:true}); h.emit('scroll'); assert.equal(h.hidden,false); h.unmount();
});
test('projects, rails, outgoing screens, dialogs, editors and keyboard-focused navigation retain their own behavior', () => {
  const h=harness(); h.render();
  for (const selector of ['[data-mobile-project-view]', '.mobile-navigation-layer', '.screen-exit', '[inert]', '[role="dialog"]', '[role="menu"]', 'textarea']) {
    h.emit('wheel',new h.Element(selector)); h.emit('scroll',new h.Element(selector)); assert.equal(h.hidden,false, selector);
  }
  h.modal(true); h.emit('wheel'); h.emit('scroll'); assert.equal(h.hidden,false); h.modal(false);
  for(const set of [h.focus,h.editor]) { set(true); h.emit('wheel'); h.emit('scroll'); assert.equal(h.hidden,false); set(false); }
  const still=new h.Element(); still.scrollHeight=still.clientHeight; h.emit('wheel',still); h.emit('scroll',still); assert.equal(h.hidden,false); h.unmount();
});
test('keyboard access, focus, route changes, expanded navigation and unmount restore and clean up', () => {
  const h=harness(); h.render(); hide(h); h.emit('keydown'); assert.equal(h.hidden,false);
  hide(h); h.emit('focusin'); assert.equal(h.hidden,false);
  hide(h); h.render(true,'/p/creator'); assert.equal(h.hidden,false); assert.equal(h.timers.size,0);
  hide(h); h.render(false,'/p/creator'); assert.equal(h.hidden,false); assert.equal(h.listeners.size,0);
  h.render(); h.dock.inert=true; hide(h); h.unmount(); assert.equal(h.dock.inert,true); assert.equal(h.listeners.size,0); assert.equal(h.timers.size,0);
});

test('a deliberate content tap reveals the dock immediately while continued drags keep it hidden', () => {
  const h=harness(); h.render(); hide(h);
  h.emit('pointerdown'); h.emit('pointerup');
  assert.equal(h.hidden,false); assert.equal(h.dock.inert,false); assert.equal(h.timers.size,0);
  hide(h); h.emit('pointerdown'); h.emit('pointermove',undefined,{clientY:120}); h.emit('pointerup',undefined,{clientY:120});
  assert.equal(h.hidden,true); h.unmount();
});

test('decelerating content restores the dock before native scrollend and keeps low wheel-tail events visible', () => {
  for (const nativeScrollEnd of [false,true]) {
    const h=harness(nativeScrollEnd), target=new h.Element(); h.render();
    h.emit('wheel',target); h.scroll(target,0,0); h.scroll(target,16);
    assert.equal(h.hidden,true);
    for (const top of [18,20]) { h.emit('wheel',target); h.scroll(target,top); assert.equal(h.hidden,true,'One fast sample and less than48ms of slowing must not reveal'); }
    h.emit('wheel',target); h.scroll(target,22);
    assert.equal(h.hidden,false,'The dock starts returning while actual scroll position still changes');
    assert.equal(h.dock.inert,false); assert.equal(h.dock.attrs.has('aria-hidden'),false);
    for (const top of [24,26,28]) { h.emit('wheel',target); h.scroll(target,top); assert.equal(h.hidden,false,'A continuing low-speed trackpad tail cannot hide/reveal the dock repeatedly'); }
    h.emit('wheel',target); h.scroll(target,32); assert.equal(h.hidden,false,'Hysteresis retains the dock below the fast-resume threshold');
    h.emit('scrollend',target); assert.equal(h.hidden,false); assert.equal(h.timers.size,0);
    h.unmount();
  }
});

test('a fast rebound resets the slow window, and acceleration after early reveal hides the dock again', () => {
  const h=harness(true), target=new h.Element(); h.render(); h.emit('wheel',target);
  h.scroll(target,0,0); h.scroll(target,16); h.scroll(target,18);
  h.scroll(target,34); assert.equal(h.hidden,true,'A single slow sample followed by speed must not reveal');
  for (const top of [36,38]) { h.scroll(target,top); assert.equal(h.hidden,true); }
  h.scroll(target,40); assert.equal(h.hidden,false);
  h.emit('wheel',target); h.scroll(target,56); assert.equal(h.hidden,true,'New fast movement can hide after a low-speed reveal');
  for (const top of [58,60]) { h.scroll(target,top); assert.equal(h.hidden,true); }
  h.scroll(target,62); assert.equal(h.hidden,false);
  h.emit('pointerdown',target); h.emit('pointermove',target,{clientY:120}); h.scroll(target,64);
  assert.equal(h.hidden,true,'A fresh pointer gesture owns a new hide/reveal cycle');
  h.unmount();
});

test('duplicate scroll positions cannot trigger deceleration reveal and another scroll owner resets sampling', () => {
  const h=harness(true), first=new h.Element(), second=new h.Element(); h.render(); h.emit('wheel',first);
  h.scroll(first,0,0); h.scroll(first,16); h.scroll(first,18);
  h.scroll(first,18,48); assert.equal(h.hidden,true,'Time passing without actual displacement is not deceleration evidence');
  h.scroll(second,70);
  for (const top of [72,74,76,78]) { h.scroll(second,top); assert.equal(h.hidden,true,'A different owner cannot inherit the first owner fast/slow samples'); }
  h.scroll(second,110);
  for (const top of [112,114]) { h.scroll(second,top); assert.equal(h.hidden,true); }
  h.scroll(second,116); assert.equal(h.hidden,false);
  h.unmount();
});

test('document horizontal motion uses its real scroll position and the same deceleration rule', () => {
  const h=harness(true), target=h.document, content=new h.Element(); h.render();
  h.document.scrollingElement.scrollWidth=2000;
  h.emit('wheel',content,{deltaY:0,deltaX:20}); h.scroll(target,0,0,0); h.scroll(target,0,16,16);
  for (const left of [18,20]) { h.scroll(target,0,16,left); assert.equal(h.hidden,true); }
  h.scroll(target,0,16,22); assert.equal(h.hidden,false);
  h.emit('scrollend',target); assert.equal(h.timers.size,0); h.unmount();
});

test('route, disabled navigation and unmount clear an in-progress deceleration cycle', () => {
  for (const finish of [h=>h.render(true,'/p/creator'),h=>h.render(false),h=>h.unmount()]) {
    const h=harness(), target=new h.Element(); h.render(); h.emit('wheel',target);
    h.scroll(target,0,0); h.scroll(target,16); h.scroll(target,18);
    assert.equal(h.hidden,true); finish(h);
    assert.equal(h.hidden,false); assert.equal(h.dock.inert,false); assert.equal(h.timers.size,0);
    h.tick(200); assert.equal(h.hidden,false);
    if (h.listeners.size) h.unmount();
  }
});
