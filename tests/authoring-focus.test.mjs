import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceModule} from './helpers/source-module.mjs';

function harness({enabled=true,visual=true,focused=false,fieldTop=650,fieldHeight=44,scrollTop=0,scrollHeight=1400,clientHeight=660}={}){
 const target=(values={})=>{const listeners=new Map();return {...values,listeners,addEventListener(name,callback){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(callback);},removeEventListener(name,callback){listeners.get(name)?.delete(callback);if(listeners.get(name)?.size===0)listeners.delete(name);},emit(name){for(const callback of [...(listeners.get(name)??[])])callback();},count(){return [...listeners.values()].reduce((count,set)=>count+set.size,0);}};};
 const viewport=target({height:912,offsetTop:0});
 const window=target({innerHeight:912,scrollTo(){assert.fail('Authoring focus must never scroll the document');}});
 if(visual)window.visualViewport=viewport;
 const bounds={frameTop:0,frameBottom:912,scrollTop:160,fieldTop,fieldHeight};
 const scroller=target({scrollTop,clientTop:0,clientHeight,scrollHeight,getBoundingClientRect:()=>({top:bounds.scrollTop,bottom:bounds.scrollTop+clientHeight,height:clientHeight})});
 class HTMLElement{
  constructor(){this.editable=true;this.disabled=false;this.readOnly=false;this.inside=true;this.authoring=true;}
  matches(){return this.editable&&!this.disabled&&!this.readOnly;}
  closest(){return this.authoring?scroller:null;}
  getBoundingClientRect(){return {top:bounds.fieldTop-scroller.scrollTop,bottom:bounds.fieldTop-scroller.scrollTop+bounds.fieldHeight,height:bounds.fieldHeight};}
 }
 const field=new HTMLElement(),frame=target({contains:element=>element===scroller||element===field&&field.inside,getBoundingClientRect:()=>({top:bounds.frameTop,bottom:bounds.frameBottom,height:bounds.frameBottom-bounds.frameTop})}),document={activeElement:focused?field:null};
 const frames=new Map();let id=0,effect;
 const {useAuthoringFocus}=sourceModule('src/components/publishing/useAuthoringFocus.ts',{react:{useEffect:callback=>{effect=callback;}}},{window,document,HTMLElement,requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},cancelAnimationFrame:key=>frames.delete(key)});
 useAuthoringFocus({current:frame},enabled);const cleanup=effect();
 return {window,viewport,document,field,frame,scroller,bounds,cleanup:()=>cleanup?.(),pending:()=>frames.size,
  focus(){document.activeElement=field;frame.emit('focusin');},
  resize(height,top=0){viewport.height=height;viewport.offsetTop=top;bounds.frameTop=top;bounds.frameBottom=top+height;if(!visual)window.innerHeight=height;viewport.emit('resize');window.emit('resize');},
  flush(){const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();},
 };
}

test('authoring focus reveals a clipped input within the measured screen using only its own scrollTop',()=>{
 const h=harness();h.focus();h.flush();assert.equal(h.scroller.scrollTop,0);
 h.resize(450,24);h.flush();assert.equal(h.scroller.scrollTop,228);
 h.viewport.emit('scroll');h.flush();assert.equal(h.scroller.scrollTop,228,'An already visible field stays still');
 assert.equal(h.scroller.count(),0,'Ordinary user scrolling is not intercepted');h.cleanup();
});

test('already-focused tall textareas align their first line and above-screen fields scroll upward without exceeding limits',()=>{
 const tall=harness({focused:true,fieldTop:350,fieldHeight:500});tall.resize(450,24);tall.flush();assert.equal(tall.scroller.scrollTop,182);tall.cleanup();
 const above=harness({focused:true,fieldTop:200,scrollTop:500});above.flush();assert.equal(above.scroller.scrollTop,32);above.cleanup();
 const limit=harness({focused:true,fieldTop:5000});limit.flush();assert.equal(limit.scroller.scrollTop,740);limit.cleanup();
});

test('noneditable, unrelated and disabled scopes do not move authoring content',()=>{
 for(const alter of [h=>{h.field.editable=false;},h=>{h.field.disabled=true;},h=>{h.field.readOnly=true;},h=>{h.field.inside=false;},h=>{h.field.authoring=false;},h=>{h.bounds.fieldHeight=0;},h=>{h.viewport.scale=1.7;}]){
  const h=harness({focused:true});alter(h);h.resize(450,24);h.flush();assert.equal(h.scroller.scrollTop,0);h.cleanup();
 }
 const disabled=harness({enabled:false,focused:true});disabled.resize(450);disabled.flush();assert.equal(disabled.scroller.scrollTop,0);assert.equal(disabled.frame.count(),0);assert.equal(disabled.viewport.count(),0);assert.equal(disabled.window.count(),0);
});

test('focus measurements coalesce, fall back without VisualViewport and remove listeners/pending work on unmount',()=>{
 const h=harness({focused:true});h.resize(450,24);h.viewport.emit('scroll');h.frame.emit('focusin');assert.equal(h.pending(),1);
 h.cleanup();assert.equal(h.pending(),0);assert.equal(h.viewport.count(),0);assert.equal(h.window.count(),0);assert.equal(h.frame.count(),0);assert.equal(h.scroller.scrollTop,0);
 const fallback=harness({visual:false,focused:true});fallback.resize(450);fallback.flush();assert.equal(fallback.scroller.scrollTop,252);fallback.cleanup();assert.equal(fallback.window.count(),0);
});
