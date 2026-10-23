import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.mjs';
const {advanceMobileScreenStack:advance}=sourceModule('src/presentation/mobile/mobileScreenStack.ts');
function stack(){let state=null,id=0;return {move(key,screen,action='PUSH',scope='account'){state=advance(state,{entryKey:key,action,scope},screen,{content:screen},()=>id++);return state;}};}
test('native POP reveals the same mounted predecessor and discards only the dismissed frame',()=>{
 const s=stack(),first=s.move('owner','profile-owner'),owner=first.frames[0].id;
 s.move('person','profile-person');const deep=s.move('another','profile-another');
 assert.equal(deep.frames[0].retained,true);assert.equal(deep.frames[1].underlay,true);
 const personId=deep.frames[1].id;
 const back=s.move('person','profile-person','POP');assert.equal(back.frames.length,2);assert.equal(back.frames[1].id,personId);assert.equal(back.frames[1].restored,true);
 const home=s.move('owner','profile-owner','POP');assert.equal(home.frames[0].id,owner);assert.equal(home.frames.length,1);
});
test('same-workspace tab replacement retains its instance and a later POP restores that exact entry',()=>{
 const s=stack(),id=s.move('portfolio','profile-owner').frames[0].id;
 assert.equal(s.move('following','profile-owner','REPLACE').frames[0].id,id);
 s.move('person','profile-person');const back=s.move('following','profile-owner','POP');assert.equal(back.frames[0].id,id);
 assert.deepEqual(Array.from(back.frames[0].entries),['following']);
});
test('account scope and unavailable browser entries cannot reuse old content',()=>{
 const s=stack(),old=s.move('a','profile').frames[0].id;s.move('b','other');
 const account=s.move('c','profile','PUSH','new-account');assert.equal(account.frames.length,1);assert.notEqual(account.frames[0].id,old);
 const outside=s.move('unknown','search','POP','new-account');assert.equal(outside.frames.length,1);assert.equal(Boolean(outside.frames[0].retained),false);
});
test('pull completion performs Back once only after its one exit animation, with no reset',async()=>{
 let resolve,back=0,options;const root={dataset:{}},surface={animate(frames,value){options=value;assert.equal(frames[0].transform,'translate3d(0, 90px, 0)');assert.equal(frames[1].transform,'translate3d(0, 912px, 0)');return{finished:new Promise(r=>resolve=r)};}};
 const {commitPullDismiss}=sourceModule('src/presentation/mobile/pullDismissMotion.ts',{'../motion/motion':{motionMs:()=>260,motionEase:()=> 'linear'}},{document:{documentElement:root},window:{innerHeight:912}});
 commitPullDismiss(surface,90,()=>back++);assert.equal(back,0);assert.equal(root.dataset.mobilePullDismiss,'committing');assert.equal(options.fill,'forwards');resolve();await Promise.resolve();assert.equal(back,1);resolve();await Promise.resolve();assert.equal(back,1);
});

test('superseded exit completion or cancellation cannot commit Back or hide the new underlay', async () => {
 for (const outcome of ['finish', 'cancel']) {
  let resolve, reject, back = 0, current = true;
  const root = { dataset: {} }, surface = { animate: () => ({ finished: new Promise((yes, no) => { resolve = yes; reject = no; }) }) };
  const { commitPullDismiss } = sourceModule('src/presentation/mobile/pullDismissMotion.ts', { '../motion/motion': { motionMs: () => 260, motionEase: () => 'linear' } }, { document: { documentElement: root }, window: { innerHeight: 912 } });
  commitPullDismiss(surface, 90, () => back++, () => current);
  if (outcome === 'finish') resolve();
  current = false; root.dataset.mobilePullDismiss = 'tracking';
  if (outcome === 'cancel') reject(Error('Canceled'));
  await Promise.resolve(); assert.equal(back, 0); assert.equal(root.dataset.mobilePullDismiss, 'tracking');
 }
});

test('superseded snap-back cannot restore a frame now owned by another touch', async () => {
 let resolve, current = true, restored = 0, canceled = 0;
 const surface = { animate: () => ({ finished: new Promise(yes => { resolve = yes; }), cancel: () => canceled++ }) };
 const { cancelPullDismiss } = sourceModule('src/presentation/mobile/pullDismissMotion.ts', { '../motion/motion': { motionMs: () => 180, motionEase: () => 'linear' } });
 cancelPullDismiss(surface, 30, () => restored++, () => current);
 resolve(); current = false; await Promise.resolve(); assert.equal(restored, 0); assert.equal(canceled, 0);
});

test('prepared pull stage restores ancestors, placeholder and popstate ownership only once', () => {
 let interrupted = 0, removed = 0;
 const events = new Map(), attrs = new Set(), parent = { scrollTop: 88, scrollLeft: 9, parentElement: null };
 const placeholder = { style: {}, setAttribute() {}, remove: () => removed++ };
 const frame = { parentElement: parent, scrollTop: 0, style: { removeProperty() {} }, before() {}, getBoundingClientRect: () => ({ height: 900 }), setAttribute: key => attrs.add(key), removeAttribute: key => attrs.delete(key) };
 const surface = { closest: () => frame }, window = { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
 const { preparePullSurface } = sourceModule('src/presentation/mobile/pullDismissMotion.ts', { '../motion/motion': { interruptNavigationMotion: () => interrupted++ } }, { document: { scrollingElement: parent, createElement: () => placeholder }, window });
 const stage = preparePullSurface(surface); assert.equal(stage.surface, frame); assert.equal(interrupted, 1); assert.equal(frame.scrollTop, 88); assert.equal(placeholder.style.height, '900px');
 parent.scrollTop = 0; parent.scrollLeft = 0; stage.restore(); stage.restore();
 assert.equal(parent.scrollTop, 88); assert.equal(parent.scrollLeft, 9); assert.equal(frame.scrollTop, 0); assert.equal(removed, 1); assert.equal(attrs.size, 0); assert.equal(events.size, 0);
});

test('dock root navigation releases prior pushed screens without resetting the current root instance',()=>{
 let id=0;const alloc=()=>id++;let state=advance(null,{entryKey:'a',action:'POP',scope:'account'},'root',{},alloc);
 state=advance(state,{entryKey:'b',action:'PUSH',scope:'account'},'person',{},alloc);
 const current=state.frames[1].id;
 state=advance(state,{entryKey:'c',action:'PUSH',scope:'account',reset:true},'person',{},alloc);
 assert.equal(state.frames.length,1);assert.equal(state.frames[0].id,current);
 state=advance(state,{entryKey:'d',action:'PUSH',scope:'account',reset:true},'home',{},alloc);assert.equal(state.frames.length,1);
});
