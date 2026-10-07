import assert from 'node:assert/strict';
import test from 'node:test';
import {api,fixture,ids,request} from './helpers/reach-fixture.mjs';
const addComment=(f,id,account,page,at)=>f.sqlite.prepare('INSERT INTO media_comments(id,account_id,project_id,attachment_id,page_index,author_name,body,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,account,ids.project,ids.attachment,page,'Member','Hello',at);
test('attention requires authentication and refuses writes',async()=>{
 const f=fixture();assert.equal((await api.handleStudioAttention(request('/api/studio/attention'),f.db,f.config)).status,401);
 assert.equal((await api.handleStudioAttention(request('/api/studio/attention',{},ids.owner),f.db,f.config)).status,405);
});
test('unanswered comments clear after a later owner page response; private saves stay aggregate',async()=>{
 const f=fixture();const recent=new Date(Date.now()-86400000).toISOString(),old=new Date(Date.now()-10*86400000).toISOString();
 addComment(f,'c1',ids.other,1,old);addComment(f,'c2',ids.other,2,recent);
 f.sqlite.prepare("INSERT INTO media_engagements(account_id,project_id,attachment_id,page_index,kind,created_at) VALUES(?,?,?,?,'save',?)").run(ids.other,ids.project,ids.attachment,0,recent);
 let body=await (await api.handleStudioAttention(request('/api/studio/attention',undefined,ids.owner),f.db,f.config)).json();
 assert.equal(body.weeklySaved,1);assert.equal(body.activity.filter(e=>e.kind==='reply').length,2);assert.equal(body.activity.filter(e=>e.kind==='read').length,1);
 assert.ok(body.activity.every(e=>!('accountId' in e)&&!('actor_name' in e)));
 addComment(f,'reply',ids.owner,1,new Date().toISOString());
 body=await (await api.handleStudioAttention(request('/api/studio/attention',undefined,ids.owner),f.db,f.config)).json();
 assert.equal(body.activity.filter(e=>e.kind==='reply').length,1);assert.equal(body.activity[0].page,2);
});

test('legacy D1 still supplies comments and aggregate saves before the pending disclosure table',async()=>{const f=fixture({pending:false});addComment(f,'legacy',ids.other,0,new Date().toISOString());const response=await api.handleStudioAttention(request('/api/studio/attention',undefined,ids.owner),f.db,f.config);assert.equal(response.status,200);const body=await response.json();assert.equal(body.activity.filter(e=>e.kind==='reply').length,1);assert.equal(body.weeklySaved,0);});

test('another authenticated account cannot select the creator through query parameters',async()=>{const f=fixture();addComment(f,'private-owner-row',ids.other,0,new Date().toISOString());const response=await api.handleStudioAttention(request('/api/studio/attention?owner='+ids.owner,undefined,ids.other),f.db,f.config);assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body.activity,[]);assert.equal(body.weeklySaved,0);});
