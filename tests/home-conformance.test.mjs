import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.mjs';
function pull({enabled=true,busy=false}={}){
 const listeners=new Map(),slots=[],scroll={scrollTop:0},reports=[];let cursor=0,calls=0,label='',effects=[];
 const same=(left,right)=>left&&right&&left.length===right.length&&left.every((value,index)=>Object.is(value,right[index]));
 const react={useRef(value){return slots[cursor++]??={current:value};},useState(initial){const index=cursor++;slots[index]??={value:initial};return[slots[index].value,next=>{slots[index].value=next;}];},useEffect(fn,deps){const index=cursor++,prior=slots[index];if(!same(prior?.deps,deps)){slots[index]={deps};effects.push(()=>{prior?.cleanup?.();slots[index].cleanup=fn();});}}};
 const target={addEventListener:(name,fn,options)=>listeners.set(name,{fn,options}),removeEventListener:(name,fn)=>{if(listeners.get(name)?.fn===fn)listeners.delete(name);}};
 class Element{closest(){return false;}}
 const module=sourceModule('src/components/home/useHomePullRefresh.ts',{react},{document:{scrollingElement:scroll,querySelector:()=>null},window:{scrollY:0},Element});
 const ref={current:target};const refresh=()=>calls++;let options={enabled,busy,onPull:(...args)=>reports.push(args)};
 const render=(change={})=>{options={...options,...change};cursor=0;label=module.useHomePullRefresh(ref,options.enabled,options.busy,refresh,options.onPull);return label;};
 const commit=()=>{const pending=effects;effects=[];pending.forEach(run=>run());};render();commit();
 const event=(x,y,n=1)=>({target:new Element(),cancelable:true,preventDefault(){this.prevented=true;},touches:Array.from({length:n},()=>({clientX:x,clientY:y}))});
 return {scroll,listeners,reports,render,commit,event,get calls(){return calls;},get label(){return render();},update(change){render(change);commit();},busy(value){render({busy:value});commit();},send(type,x=100,y=100,n=1){const e=event(x,y,n);listeners.get(type)?.fn(e);return e;},dispose(){for(const slot of slots)slot?.cleanup?.();}};
}
test('one downward release at the top refreshes exactly once and consumes only an active pull',()=>{const h=pull();h.send('touchstart');assert.equal(h.send('touchmove',100,160).prevented,true);assert.equal(h.label,'Pull to refresh');h.send('touchmove',100,180);assert.equal(h.label,'Release to refresh');h.send('touchend');h.send('touchend');assert.equal(h.calls,1);assert.equal(h.label,'');assert.equal(h.listeners.get('touchmove').options.passive,false);h.dispose();assert.equal(h.listeners.size,0);});
test('short, horizontal, upward, pinch, cancelled, busy and scrolled gestures never refresh',()=>{
 for(const kind of ['short','horizontal','up','pinch','cancel','busy','scrolled']){const h=pull();if(kind==='busy')h.busy(true);if(kind==='scrolled')h.scroll.scrollTop=20;h.send('touchstart',100,100,kind==='pinch'?2:1);h.send('touchmove',kind==='horizontal'?230:100,kind==='short'?140:kind==='up'?50:200,kind==='pinch'?2:1);h.send(kind==='cancel'?'touchcancel':'touchend');assert.equal(h.calls,0,kind);}
 const disabled=pull({enabled:false});assert.equal(disabled.listeners.size,0);
});
test('busy or scrolling after a pull begins cancels the pending refresh',()=>{for(const action of ['busy','scroll']){const h=pull();h.send('touchstart');h.send('touchmove',100,200);if(action==='busy')h.busy(true);else h.scroll.scrollTop=20;h.send('touchend');assert.equal(h.calls,0);}});

test('withdrawing a ready pull cancels it rather than refreshing on release',()=>{const h=pull();h.send('touchstart');h.send('touchmove',100,200);h.send('touchmove',100,105);h.send('touchend');assert.equal(h.calls,0);assert.equal(h.label,'');});

test('pull progress is immediate and only a qualifying release reports real refresh intent',()=>{
 const h=pull();h.send('touchstart');h.send('touchmove',100,160);
 assert.deepEqual(h.reports.at(-1),[60]);assert.equal(h.calls,0);assert.equal(h.label,'Pull to refresh');
 h.send('touchmove',100,180);assert.deepEqual(h.reports.at(-1),[80]);assert.equal(h.label,'Release to refresh');
 h.send('touchend');assert.deepEqual(h.reports.at(-1),[null,true]);assert.equal(h.calls,1);assert.equal(h.label,'');
 h.send('touchstart');h.send('touchmove',100,180);h.send('touchcancel');
 assert.deepEqual(h.reports.at(-1),[null,false],'A touchcancel Event must not become a truthy refresh intent');assert.equal(h.calls,1);h.dispose();
});

test('a replacement account gesture owner hides the old announcement and cannot release its ready pull',()=>{
 const h=pull();h.send('touchstart');h.send('touchmove',100,200);assert.equal(h.label,'Release to refresh');
 const previous=new Map(h.listeners),replacement=[];
 h.render({onPull:(...args)=>replacement.push(args)});assert.equal(h.label,'','The previous account label must disappear before effect cleanup');
 previous.get('touchend').fn(h.event(100,200));assert.equal(h.calls,0,'A captured old listener cannot request refresh for the new account');
 previous.get('touchmove').fn(h.event(100,240));assert.equal(replacement.length,0);
 h.commit();assert.equal(h.listeners.size,4);assert.deepEqual(replacement.at(-1),[null,false]);
 previous.get('touchend').fn(h.event(100,200));assert.equal(h.calls,0);
 h.send('touchstart');h.send('touchmove',100,200);h.send('touchend');assert.equal(h.calls,1);assert.deepEqual(replacement.at(-1),[null,true]);h.dispose();
});

test('deactivation and unmount invalidate a ready release without preserving its screen-reader label',()=>{
 for(const action of ['inactive','unmount']){
  const h=pull();h.send('touchstart');h.send('touchmove',100,200);const prior=new Map(h.listeners);
  if(action==='inactive'){h.render({enabled:false});assert.equal(h.label,'');prior.get('touchend').fn(h.event(100,200));assert.equal(h.calls,0);h.commit();}
  else h.dispose();
  prior.get('touchend').fn(h.event(100,200));assert.equal(h.calls,0);assert.equal(h.label,'');assert.equal(h.listeners.size,0);
  if(action==='inactive'){h.update({enabled:true});h.send('touchend');assert.equal(h.calls,0,'Returning to Home must not resume the old ready gesture');h.dispose();}
 }
});
