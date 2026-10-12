import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.mjs';
const {homeGridColumns}=sourceModule('src/components/home/homeGrid.ts',{'../../utils/projectGridDensity':sourceModule('src/utils/projectGridDensity.ts')});
for(const width of [375,390,430])test(`Home at ${width}px preserves 16px gutters and falls back to two readable columns`,()=>{const content=width-32;for(const saved of [2,3,5,13])assert.equal(homeGridColumns(saved,content),2);assert.ok((content-4)/2>=150);});
test('saved density is respected whenever it fits; an unavailable measurement stays at two',()=>{assert.equal(homeGridColumns(3,458),3);assert.equal(homeGridColumns(3,457),2);assert.equal(homeGridColumns(4,612),4);assert.equal(homeGridColumns(13,2000),13);assert.equal(homeGridColumns(3,0),2);});
function pull({enabled=true,busy=false}={}){
 const listeners=new Map(),refs=[],scroll={scrollTop:0};let label='',calls=0,cleanup;
 const react={useRef(value){const ref={current:value};refs.push(ref);return ref;},useState:()=>[label,next=>{label=next;}],useEffect:fn=>{cleanup=fn();}};
 const target={addEventListener:(name,fn,options)=>listeners.set(name,{fn,options}),removeEventListener:name=>listeners.delete(name)};
 class Element{closest(){return false;}}
 const module=sourceModule('src/components/home/useHomePullRefresh.ts',{react},{document:{scrollingElement:scroll,querySelector:()=>null},window:{scrollY:0},Element});
 module.useHomePullRefresh({current:target},enabled,busy,()=>calls++);
 const event=(x,y,n=1)=>({target:new Element(),cancelable:true,preventDefault(){this.prevented=true;},touches:Array.from({length:n},()=>({clientX:x,clientY:y}))});
 return {scroll,listeners,get calls(){return calls;},get label(){return label;},busy:value=>{refs[0].current.busy=value;},send(type,x=100,y=100,n=1){const e=event(x,y,n);listeners.get(type)?.fn(e);return e;},dispose:()=>cleanup?.()};
}
test('one downward release at the top refreshes exactly once and consumes only an active pull',()=>{const h=pull();h.send('touchstart');assert.equal(h.send('touchmove',100,160).prevented,true);assert.equal(h.label,'Pull to refresh');h.send('touchmove',100,180);assert.equal(h.label,'Release to refresh');h.send('touchend');h.send('touchend');assert.equal(h.calls,1);assert.equal(h.label,'');assert.equal(h.listeners.get('touchmove').options.passive,false);h.dispose();assert.equal(h.listeners.size,0);});
test('short, horizontal, upward, pinch, cancelled, busy and scrolled gestures never refresh',()=>{
 for(const kind of ['short','horizontal','up','pinch','cancel','busy','scrolled']){const h=pull();if(kind==='busy')h.busy(true);if(kind==='scrolled')h.scroll.scrollTop=20;h.send('touchstart',100,100,kind==='pinch'?2:1);h.send('touchmove',kind==='horizontal'?230:100,kind==='short'?140:kind==='up'?50:200,kind==='pinch'?2:1);h.send(kind==='cancel'?'touchcancel':'touchend');assert.equal(h.calls,0,kind);}
 const disabled=pull({enabled:false});assert.equal(disabled.listeners.size,0);
});
test('busy or scrolling after a pull begins cancels the pending refresh',()=>{for(const action of ['busy','scroll']){const h=pull();h.send('touchstart');h.send('touchmove',100,200);if(action==='busy')h.busy(true);else h.scroll.scrollTop=20;h.send('touchend');assert.equal(h.calls,0);}});

test('withdrawing a ready pull cancels it rather than refreshing on release',()=>{const h=pull();h.send('touchstart');h.send('touchmove',100,200);h.send('touchmove',100,105);h.send('touchend');assert.equal(h.calls,0);assert.equal(h.label,'');});
