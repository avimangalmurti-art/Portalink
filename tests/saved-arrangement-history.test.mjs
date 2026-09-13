import assert from 'node:assert/strict';
import test from 'node:test';
import { hookHarness, deferred } from './helpers/hook-harness.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const projects = ids => ids.map(id => ({ id }));
const profileFile = 'src/features/profile/useProfileProjectOrder.ts';
const projectFile = 'src/features/profile/useProjectArrangement.ts';
const portalFile = 'src/features/profile/useCategoryManagement.ts';
const arrangement = ids => ({ projectOrder: ids, hiddenProjectIds: [], pinnedProjectIds: [] });

test('saved profile order supports Undo/Redo, matching refresh, and failed Undo retry', async () => {
  const writes = []; let fail = false;
  const h = hookHarness(profileFile, 'useProfileProjectOrder', { projects: {
    async saveProfileProjectOrder(owner, order) { if (fail) throw new Error('offline'); writes.push(plain(order)); },
  } }, {}, ['owner', projects(['a','b','c']), true]);
  await h.flush(); h.value.move('c','a'); assert.equal(await h.value.commit(),true); await h.flush();
  assert.deepEqual(plain(h.value.order),['c','a','b']); assert.equal(h.value.history.canUndo,true);
  h.options(['owner',projects(['c','a','b']),true]); await h.flush();
  assert.equal(h.value.history.canUndo,true);
  fail=true; assert.equal(await h.value.history.undo(),false); await h.flush();
  assert.deepEqual(plain(h.value.order),['c','a','b']); assert.equal(h.value.history.canUndo,true);
  fail=false; assert.equal(await h.value.retry(),true); await h.flush();
  assert.equal(h.value.history.canRedo,true); assert.deepEqual(plain(h.value.order),['a','b','c']);
  assert.equal(await h.value.history.redo(),true); await h.flush();
  assert.deepEqual(writes,[['c','a','b'],['a','b','c'],['c','a','b']]);
  h.dispose();
});

test('double activation writes once and late saves cannot change a different profile', async () => {
  const pending = deferred(); let count=0;
  const h=hookHarness(profileFile,'useProfileProjectOrder',{projects:{saveProfileProjectOrder(){count++;return pending.promise;}}},{},['owner',projects(['a','b']),true]);
  await h.flush();h.value.move('b','a'); const first=h.value.commit(); const second=h.value.commit();
  assert.equal(await second,false);assert.equal(count,1);
  h.options(['another',projects(['x','y']),true]); await h.flush();pending.resolve();assert.equal(await first,false);await h.flush();
  assert.deepEqual(plain(h.value.order),['x','y']);assert.equal(h.value.history.canUndo,false);h.dispose();
});

test('removing a project invalidates profile history instead of resurrecting it', async () => {
  const h=hookHarness(profileFile,'useProfileProjectOrder',{projects:{async saveProfileProjectOrder(){}}},{},['owner',projects(['a','b']),true]);
  await h.flush();h.value.move('b','a');await h.value.commit();await h.flush();
  h.options(['owner',projects(['b']),true]);await h.flush();
  assert.equal(h.value.history.canUndo,false);assert.equal(await h.value.history.undo(),false);assert.deepEqual(plain(h.value.order),['b']);h.dispose();
});

test('project visibility stays unknown until loaded and stale loads cannot replace a different portal', async () => {
  const a=deferred(),b=deferred();
  const h=hookHarness(projectFile,'useProjectArrangement',{projects:{getProjectArrangement:(_p,c)=>c==='one'?a.promise:b.promise}},{},['owner','one',false,['a']]);
  assert.equal(h.value.isLoading,true);assert.deepEqual(plain(h.value.arrange(projects(['a']),false)),[]);
  h.options(['owner','two',false,['b']]);await h.flush();a.resolve(arrangement(['a']));await h.flush();
  assert.equal(h.value.isLoading,true);b.reject(new Error('offline'));await h.flush();
  assert.ok(h.value.loadError);assert.deepEqual(plain(h.value.arrange(projects(['b']),false)),[]);h.dispose();
});

test('project pin/hide Undo saves the original state; membership reload clears stale IDs', async () => {
  let current=arrangement(['a','b']);const writes=[];let reads=0;
  const h=hookHarness(projectFile,'useProjectArrangement',{projects:{async getProjectArrangement(){reads++;return plain(current);},async saveProjectArrangement(_p,_c,next){current=plain(next);writes.push(current);}}},{},['owner','portal',true,['a','b']]);
  await h.flush();h.value.togglePinned('b');await h.flush();assert.deepEqual(plain(h.value.pinnedIds),['b']);
  await h.value.history.undo();await h.flush();assert.deepEqual(plain(h.value.pinnedIds),[]);assert.equal(h.value.history.canRedo,true);
  await h.value.history.redo();await h.flush();h.value.toggleHidden('b');await h.flush();
  assert.deepEqual(plain(h.value.hiddenIds),['b']);assert.deepEqual(plain(h.value.pinnedIds),[]);
  await h.value.history.undo();await h.flush();assert.deepEqual(plain(h.value.pinnedIds),['b']);assert.deepEqual(plain(h.value.hiddenIds),[]);
  current=arrangement(['a','c']);h.options(['owner','portal',true,['a','c']]);assert.equal(h.value.isLoading,true);await h.flush();
  assert.equal(h.value.history.canUndo,false);h.value.reorder(['c','a']);await h.flush();assert.deepEqual(writes.at(-1).projectOrder,['c','a']);assert.equal(reads,2);h.dispose();
});

test('portal history survives cache invalidation and failed icon retry cannot revert a new icon', async () => {
  let cache={categories:[{id:'a'},{id:'b'}]};let current={categoryOrder:['a','b'],hiddenCategoryIds:[],categoryIcons:{a:'old'}};
  let failIcon=true;
  const h=hookHarness(portalFile,'useCategoryManagement',{profiles:{
    async getPortfolioArrangement(){return plain(current);},
    async savePortfolioArrangement(_p,next){current=plain(next);},
    async setCategoryIcon(_p,id,icon){if(failIcon)throw new Error('offline');current.categoryIcons[id]=icon;return true;},
  }},{},['owner',true],{peekProfile:()=>cache,invalidateProfiles:()=>{cache=null;}});
  await h.flush();assert.equal(await h.value.reorderCategories(['b','a']),true);await h.flush();
  assert.equal(h.value.history.canUndo,true);cache={categories:[{id:'a'},{id:'b'}]};h.rerender();await h.flush();
  assert.equal(await h.value.setCategoryIcon('a','new'),false);await h.flush();failIcon=false;h.value.failure.retry();await h.flush();
  assert.equal(h.value.arrangement.categoryIcons.a,'new');assert.equal(h.value.history.canUndo,false);
  assert.equal(await h.value.history.undo(),false);assert.equal(current.categoryIcons.a,'new');h.dispose();
});
