import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function harness() {
  let effect, cleanup, deps, modal = false, focusVisible = false, editor = false, now = 0, serial = 0;
  const listeners = new Map(), timers = new Map();
  class Element {
    constructor(excluded = false) { this.excluded = excluded; this.scrollHeight = 2000; this.clientHeight = 600; this.scrollWidth = this.clientWidth = 390; }
    closest(selector) { return this.excluded && selector.split(', ').includes(this.excluded) ? this : null; }
  }
  const frame = { contains: target => target instanceof Element };
  const dock = { inert: false, attrs: new Map(), closest: () => frame, querySelector: () => focusVisible,
    setAttribute(k,v) { this.attrs.set(k,v); }, removeAttribute(k) { this.attrs.delete(k); } };
  const ref = { current: dock }, exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useMobileDockScroll.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, HTMLElement: Element,
    window: { setTimeout(fn, delay) { const id = ++serial; timers.set(id, {fn, at:now+delay}); return id; }, clearTimeout(id) { timers.delete(id); } },
    document: { querySelector: () => modal, activeElement: { matches: () => editor },
      addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type, fn) { assert.equal(listeners.get(type),fn); listeners.delete(type); } },
    require: () => ({ useEffect(fn,next) { if (!deps || next.some((v,i)=>v!==deps[i])) { effect=fn; deps=next; } } }),
  });
  return { dock, timers, listeners, Element,
    render(enabled = true, path = '/') { exports.useMobileDockScroll(enabled,path,ref); if(effect) {cleanup?.(); cleanup=effect(); effect=null;} },
    get hidden() { return dock.attrs.has('data-scrolling'); },
    emit(type, target = new Element(), extra = {}) { listeners.get(type)?.({target,deltaY:20,deltaX:0,isPrimary:true,button:0,pointerId:1,clientX:100,clientY:100,...extra}); },
    tick(ms) { now+=ms; for(const [id,t] of timers) if(t.at<=now) {timers.delete(id);t.fn();} },
    modal(v) {modal=v;}, focus(v) {focusVisible=v;}, editor(v) {editor=v;}, unmount() {cleanup?.();},
  };
}
const hide = h => { h.emit('wheel'); h.emit('scroll'); assert.equal(h.hidden,true); };

test('actual nested content scrolling hides the dock through momentum and restores it after idle', () => {
  const h=harness(); h.render(); h.emit('scroll'); assert.equal(h.hidden,false);
  h.emit('wheel'); assert.equal(h.hidden,false,'No movement means no hiding');
  h.emit('scroll'); assert.equal(h.hidden,true); assert.equal(h.dock.inert,true); assert.equal(h.dock.attrs.get('aria-hidden'),'true');
  h.tick(200); h.emit('scroll'); h.tick(699); assert.equal(h.hidden,true,'Brief pauses do not flash the dock');
  h.tick(1); assert.equal(h.hidden,false); assert.equal(h.dock.inert,false); assert.equal(h.dock.attrs.size,0);
  h.emit('scroll'); assert.equal(h.hidden,false,'Restored position without another gesture stays visible'); h.unmount();
});
test('phone panning survives native pointer cancellation, while pinch cannot arm hiding', () => {
  const h=harness(); h.render(); h.emit('pointerdown'); h.emit('pointermove',undefined,{clientY:120}); h.emit('pointercancel'); h.emit('scroll');
  assert.equal(h.hidden,true); h.tick(700);
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
