import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceModule} from './helpers/source-module.mjs';

function harness({enabled=true,visual=true,focused=false,height=900,innerHeight=900}={}){
 const target=(attributes={})=>{const listeners=new Map();return {...attributes,listeners,
  addEventListener(name,callback){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(callback);},
  removeEventListener(name,callback){listeners.get(name)?.delete(callback);if(listeners.get(name)?.size===0)listeners.delete(name);},
  emit(name){for(const callback of [...(listeners.get(name)??[])])callback();},
  count(){return [...listeners.values()].reduce((count,set)=>count+set.size,0);},
 };};
 class HTMLElement {
  constructor(editable=false){this.editable=editable;this.tagName=editable?'INPUT':'BUTTON';this.type=editable?'search':'button';this.disabled=false;this.readOnly=false;this.isContentEditable=false;}
  matches(){return this.editable;}
 }
 const input=new HTMLElement(true),outside=new HTMLElement(true),button=new HTMLElement();
 const panel={contains:element=>element===input||element===button};
 const panelRef={current:panel};
 const viewport=target({height,width:420,offsetTop:0,scale:1});
 const frames=new Map(),timers=new Map();let id=0,cursor=0;
 const schedule=(entries,callback)=>{entries.set(++id,callback);return id;};
 const window=target({innerHeight,innerWidth:420,visualViewport:visual?viewport:undefined,
  requestAnimationFrame:callback=>schedule(frames,callback),cancelAnimationFrame:key=>frames.delete(key),
  setTimeout:callback=>schedule(timers,callback),clearTimeout:key=>timers.delete(key),
 });
 const document=target({activeElement:focused?input:null});
 const slots=[];
 const effect=(callback,dependencies)=>{const index=cursor++,previous=slots[index];if(!previous||!dependencies||dependencies.some((value,item)=>value!==previous.dependencies?.[item]))slots[index]={callback,dependencies,cleanup:previous?.cleanup,pending:true};};
 const react={
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
  useRef(value){const index=cursor++;if(!(index in slots))slots[index]={current:value};return slots[index];},
  useEffect:effect,useLayoutEffect:effect,
 };
 const {useRecipientKeyboard}=sourceModule('src/features/sharing/useRecipientKeyboard.ts',{react},{window,document,HTMLElement,requestAnimationFrame:window.requestAnimationFrame,cancelAnimationFrame:window.cancelAnimationFrame});
 const render=()=>{cursor=0;const result=useRecipientKeyboard(enabled,panelRef);for(const slot of slots)if(slot?.pending){slot.pending=false;slot.cleanup?.();slot.cleanup=slot.callback();}return result;};
 render();
 const flush=()=>{for(let iteration=0;iteration<10&&(frames.size||timers.size);iteration++){
  const scheduled=[...frames.values(),...timers.values()];frames.clear();timers.clear();for(const callback of scheduled)callback();
 }};
 return {viewport,window,document,input,button,panelRef,
  visible(){flush();return render();},
  focus(element=input){document.activeElement=element;document.emit('focusin');},
  focusOutside(){document.activeElement=outside;document.emit('focusin');},
  blur(){document.activeElement=null;document.emit('focusout');},
  resize(next,{offsetTop=viewport.offsetTop,scale=1,layoutHeight=window.innerHeight}={}){viewport.height=next;viewport.offsetTop=offsetTop;viewport.scale=scale;window.innerHeight=layoutHeight;viewport.emit('resize');window.emit('resize');},
  setEnabled(value){enabled=value;render();},
  cleanup(){for(const slot of slots)slot?.cleanup?.();},
  pending(){return frames.size+timers.size;},
 };
}

test('recipient keyboard detection follows real contraction and focus-retaining keyboard dismissal',()=>{
 const h=harness();
 h.focus();assert.equal(h.visible(),false,'Autofocus without a keyboard keeps actions available');
 h.resize(550);assert.equal(h.visible(),true);
 h.viewport.offsetTop=36;h.viewport.emit('scroll');assert.equal(h.visible(),true);
 h.resize(900);assert.equal(h.visible(),false,'Closing the keyboard restores actions even while search remains focused');
 h.resize(550);assert.equal(h.visible(),true,'A second keyboard opening uses the same editing session');
 h.blur();assert.equal(h.visible(),true,'Blur can precede the closing animation and must not restore actions early');
 h.resize(900);assert.equal(h.visible(),false);
 h.cleanup();
});

test('already-focused recipient search is observed at mount and Safari layout-height shrink does not erase its baseline',()=>{
 const h=harness({focused:true});
 h.resize(550,{layoutHeight:550});assert.equal(h.visible(),true);
 h.resize(900,{layoutHeight:900});assert.equal(h.visible(),false);
 h.cleanup();
});

test('ordinary toolbar changes, pinch zoom and unrelated focus do not hide recipient actions',()=>{
 const h=harness({height:800,innerHeight:800});
 h.focus();h.resize(720);assert.equal(h.visible(),false);
 h.resize(450,{scale:1.7});assert.equal(h.visible(),false,'Zoom shrink is not a keyboard');
 h.resize(800);h.blur();h.visible();
 h.focusOutside();h.resize(450);assert.equal(h.visible(),false,'Only editing inside this recipient panel participates');
 h.cleanup();
});

test('a small viewport-width adjustment during typing preserves the open keyboard until height recovers',()=>{
 const h=harness();h.focus();h.resize(550);assert.equal(h.visible(),true);
 h.window.innerWidth=430;h.resize(550,{layoutHeight:550});
 assert.equal(h.visible(),true,'A small width adjustment must not replace the pre-keyboard height with an obscured layout height');
 h.blur();assert.equal(h.visible(),true,'The closing-animation gap remains latched after the width adjustment');
 h.focus();h.resize(900,{layoutHeight:900});assert.equal(h.visible(),false);
 h.window.innerWidth=420;h.resize(900);assert.equal(h.visible(),false,'Small width changes alone never imply a keyboard');
 h.cleanup();
});

test('disabled and no-VisualViewport cases preserve actions and active detection cleans up on scope exit',()=>{
 for(const options of [{enabled:false},{visual:false}]){
  const h=harness(options);h.focus();h.resize(450,{layoutHeight:450});
  assert.equal(h.visible(),false);assert.equal(h.viewport.count(),0);assert.equal(h.document.count(),0);assert.equal(h.window.count(),0);h.cleanup();
 }
 const h=harness();h.focus();h.resize(550);assert.equal(h.visible(),true);
 h.setEnabled(false);assert.equal(h.visible(),false);
 assert.equal(h.viewport.count(),0);assert.equal(h.document.count(),0);assert.equal(h.window.count(),0);assert.equal(h.pending(),0);
 h.setEnabled(true);h.focus();h.resize(300);h.cleanup();
 assert.equal(h.viewport.count(),0);assert.equal(h.document.count(),0);assert.equal(h.window.count(),0);assert.equal(h.pending(),0);
});
