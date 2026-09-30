import test from 'node:test';
import assert from 'node:assert/strict';
import { api,fixture,ids,payload,request,loadModule,read } from './helpers/reach-fixture.mjs';
const model=loadModule('src/features/reads/readSignal.ts');
const plain=value=>JSON.parse(JSON.stringify(value));
const day='2026-10-04', now=Date.parse(`${day}T19:00:00Z`);
const ingest=(f,changes={},time=now)=>api.ingestReach(request('/api/reach',payload(changes)),f.db,f.config,{now:()=>time,random:()=>.5});

test('reach schema rejects identifiers, raw referrers, extra fields and invalid ranges',()=>{
  assert.deepEqual(plain(api.validateReachPayload(payload())),payload());
  for(const field of ['account_id','ip','user_agent','referrer','extra'])assert.equal(api.validateReachPayload({...payload(),[field]:'secret'}),null);
  for(const [key,value] of [['furthest_page',-2],['furthest_page',3],['page_count',0],['page_count',10001],['furthest_page',1.1],['project_id','bad'],['session_token','persisted-id'],['vw_bucket','430'],['ref_class','https://linkedin.com']])assert.equal(api.validateReachPayload(payload({[key]:value})),null);
  for(const value of [null,[],false,'text'])assert.equal(api.validateReachPayload(value),null);
});
test('stream body size is limited by actual UTF-8 bytes, not declared size',async()=>{
  const f=fixture();for(const headers of [{},{'content-length':'1'}]){const req=new Request('https://portalink.example/api/reach',{method:'POST',body:JSON.stringify({...payload(),extra:'😀'.repeat(300)}),headers});assert.equal((await api.ingestReach(req,f.db,f.config)).status,413);}
  assert.equal((await ingest(f,{ip:'secret'})).status,400);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_reach_events').get().n,0);
});
test('anonymous writes strip identity and reject hidden/private projects',async()=>{
  const f=fixture();const req=new Request('https://portalink.example/api/reach',{method:'POST',body:JSON.stringify(payload()),headers:{authorization:'Bearer secret',cookie:'identity=secret','user-agent':'secret'}});
  assert.equal((await api.ingestReach(req,f.db,f.config,{random:()=>.5})).status,204);
  assert.equal(f.calls[0].options.headers.authorization,undefined);assert.equal(f.calls[0].options.headers.cookie,undefined);
  for(const mutate of [()=>f.project.is_hidden=true,()=>{f.project.is_hidden=false;f.project.profile.is_private=true;},()=>{f.project.profile.is_private=false;f.project.category.is_hidden=true;}]){mutate();assert.equal((await ingest(f)).status,404);}
});

test('redirected reach lookup is refused before reads or writes and never follows Location',async()=>{
  for(const status of [302,307]) {
    const f=fixture();let calls=0;
    f.config.fetcher=async(_url,options)=>{
      calls++;assert.equal(options.redirect,'manual');
      return Response.json([f.project],{status,headers:{location:'https://untrusted.example/collect'}});
    };
    assert.equal((await ingest(f)).status,503);assert.equal(calls,1);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_reach_events').get().n,0);
    calls=0;
    assert.equal((await api.handleReachRead(request(`/api/reach/summary?project_id=${ids.project}`,undefined,ids.owner),f.db,f.config)).status,503);
    assert.equal(calls,1);
  }
});
test('atomic upsert deduplicates a tab per day, monotonically advances histogram, finishes once',async()=>{
  const f=fixture();for(const page of [-1,0,0,2,1,2])assert.equal((await ingest(f,{furthest_page:page})).status,204);
  let row=f.sqlite.prepare('SELECT * FROM project_reach_daily').get();assert.equal(row.opened,1);assert.equal(row.finished,1);assert.deepEqual(JSON.parse(row.max_page_hist),{'0':0,'2':1,'-1':0});
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_reach_events').get().n,1);
  assert.equal((await ingest(f,{furthest_page:0},now+86400000)).status,204);
  assert.equal(f.sqlite.prepare('SELECT sum(opened) n FROM project_reach_daily').get().n,2);
  row=f.sqlite.prepare('SELECT * FROM project_reach_events LIMIT 1').get();assert.notEqual(row.session_hash,ids.token);assert.equal(row.session_hash.length,64);assert.ok(!JSON.stringify(row).includes(ids.token));
});
test('hash changes by project/day but stays stable for retries; finished threshold is last zero-based page',async()=>{
  const a=await api.sessionHash(ids.token,ids.project,day);assert.equal(a,await api.sessionHash(ids.token,ids.project,day));assert.notEqual(a,await api.sessionHash(ids.token,ids.profile,day));assert.notEqual(a,await api.sessionHash(ids.token,ids.project,'2026-10-05'));
  const f=fixture();await ingest(f,{furthest_page:1});assert.equal(f.sqlite.prepare('SELECT finished FROM project_reach_daily').get().finished,0);await ingest(f,{furthest_page:2});assert.equal(f.sqlite.prepare('SELECT finished FROM project_reach_daily').get().finished,1);
});
test('legacy PDF counts use canonical pdf_page_count, or one unresolved document total, with real attachment IDs',async()=>{
  const f=fixture();f.project.attachments[0].metadata={};assert.equal((await ingest(f)).status,204);f.project.pdf_page_count=0;assert.equal((await ingest(f)).status,204);
  assert.equal(api.pageMap(f.project,3)[0].attachmentId,ids.attachment);
  f.project.attachments.push({id:ids.token,storage_path:'image.jpg',kind:'image',position:1});f.project.pdf_page_count=3;assert.equal(api.pageMap(f.project).length,4);
  assert.equal((await ingest(f)).status,409);
});
test('summary is owner-only, includes current page saves/comments, and missing migration returns unavailable',async()=>{
  const f=fixture();assert.equal((await api.handleReachRead(request(`/api/reach/summary?project_id=${ids.project}`),f.db,f.config)).status,401);
  assert.equal((await api.handleReachRead(request(`/api/reach/summary?project_id=${ids.project}`,undefined,ids.other),f.db,f.config)).status,403);
  await ingest(f,{},Date.now());f.sqlite.prepare("INSERT INTO media_engagements(account_id,project_id,attachment_id,page_index,kind) VALUES(?,?,?,?,?)").run(ids.other,ids.project,ids.attachment,1,'save');
  const response=await api.handleReachRead(request(`/api/reach/summary?project_id=${ids.project}`,undefined,ids.owner),f.db,f.config);assert.equal(response.status,200);const row=await response.json();assert.equal(row.saved,1);assert.equal(row.savedByPage[1],1);
  const g=fixture({pending:false});assert.equal((await api.handleReachRead(request(`/api/reach/summary?project_id=${ids.project}`,undefined,ids.owner),g.db,g.config)).status,503);
  for(const path of ['read','weekly'])assert.equal((await api.handleReachRead(request(`/api/reach/${path}`,null,ids.owner),f.db,f.config)).status,400);
});
test('page detail names comments and explicitly disclosed saves; private saves stay unnamed',async()=>{
  const f=fixture();f.sqlite.prepare("INSERT INTO media_engagements(account_id,project_id,attachment_id,page_index,kind) VALUES(?,?,?,?,?)").run(ids.other,ids.project,ids.attachment,1,'save');
  f.sqlite.prepare('INSERT INTO media_comments(id,account_id,project_id,attachment_id,page_index,author_name,body) VALUES(?,?,?,?,?,?,?)').run(ids.token,ids.other,ids.project,ids.attachment,1,'Old name','Useful research');
  const url=`/api/reach/summary?project_id=${ids.project}&page=1`;
  let detail=await (await api.handleReachRead(request(url,undefined,ids.owner),f.db,f.config)).json();assert.equal(detail.saved,1);assert.equal(detail.actors.length,1);assert.equal(detail.actors[0].name,'Reader');assert.equal(detail.actors[0].body,'Useful research');
  const stmt=await api.preparePageAction(request('/x',{},ids.other),f.db,f.config,{id:ids.other},{projectId:ids.project,attachmentId:ids.attachment,pageIndex:1},'save',null);await stmt.run();
  detail=await (await api.handleReachRead(request(url,undefined,ids.owner),f.db,f.config)).json();assert.equal(detail.actors.length,2);
  f.sqlite.prepare("DELETE FROM media_engagements WHERE account_id=?").run(ids.other);assert.equal(f.sqlite.prepare("SELECT count(*) n FROM project_page_actions").get().n,0);
});
test('rollups become cumulative page reach and <=40 truthful chart buckets',()=>{
  const row=api.summarizeRollups([{day,opened:9,finished:2,max_page_hist:JSON.stringify({'-1':1,0:4,1:2,2:2}),ref_counts:'{"linkedin":3,"own-link":6}'}],3,day);
  assert.deepEqual(plain(row.reach),[8,4,2]);assert.equal(row.weekly.finished,2);
  const reach=Array.from({length:121},(_,i)=>121-i),saved=reach.map(()=>0);saved[90]=5;
  const bars=model.bucketReach(reach,saved);assert.ok(bars.length<=40);assert.equal(bars.find(b=>b.highlighted).detailPage,90);assert.equal(bars[1].count,reach[bars[1].start]);assert.equal(model.dropSentence([3,1,0]),null);assert.equal(model.dropSentence([10,9,8]),null);assert.ok(model.dropSentence([10,4,2]));
});
test('referral categories discard URL details and reject lookalike LinkedIn domains',()=>{
  for(const [url,via,want] of [['','abc','own-link'],['https://www.linkedin.com/a?secret=yes',null,'linkedin'],['https://linkedin.com.evil.test/',null,'other'],['https://portalink.example/messages/id',null,'messages'],['https://example.com',null,'other'],['','messages','messages']])assert.equal(model.classifyReferrer(url,via,'https://portalink.example'),want);
});
test('save notifications coalesce in consecutive 24h windows, comments remain distinct, links preserve page',()=>{
  const action=(n,h,kind='save')=>({id:`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project_id:ids.project,attachment_id:ids.attachment,page_index:11,actor_profile_id:String(n),actor_name:'Mira',kind,at:new Date(now+h*3600000).toISOString(),project_title:'Study',heading:'Finding a pattern',target_path:'/p/profile/c/portal/project?media=pdf&page=12'});
  const notes=api.coalescePageActions([action(1,0),action(2,1),action(3,25),action(4,26),action(5,27,'comment')]);assert.equal(notes.length,3);assert.match(notes[0].body,/2 people.*page 12/);assert.match(notes[1].body,/2 people/);assert.match(notes[2].body,/Mira commented on page 12/);assert.match(notes[2].targetPath,/page=12/);
});
test('weekly gate is Sunday after18 local and dismissal key stays stable until Monday',()=>{
  assert.equal(model.weeklyGate(new Date(2026,9,4,17,59)),null);assert.equal(model.weeklyGate(new Date(2026,9,4,18)),'2026-10-04');assert.equal(model.weeklyGate(new Date(2026,9,5,18)),null);assert.equal(model.currentWeek(new Date(2026,9,4,23)),'2026-09-28');assert.equal(model.currentWeek(new Date(2026,9,5,0)),'2026-10-05');
});
test('collector sends opening once, first painted page promptly, monotonic debounced progress <=1 per10s',()=>{
  const timers=new Map(),sent=[];let clock=0,id=0;
  const {createReachCollector}=loadModule('src/features/reads/reachCollector.ts');
  const collector=createReachCollector(ids.project,3,{token:ids.token,referrer:'',via:null,origin:'https://portalink.example',width:430,send:p=>sent.push({p:plain(p),at:clock}),now:()=>clock,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:clock+delay});return id;},clearTimer:id=>timers.delete(id)});
  const advance=ms=>{clock=ms;for(const [key,t]of timers)if(t.at<=clock){timers.delete(key);t.fn();}};
  assert.equal(sent.length,1);assert.equal(sent[0].p.furthest_page,-1);collector.reached(0);advance(0);assert.equal(sent.length,2);collector.reached(1);collector.reached(2);collector.reached(0);advance(9999);assert.equal(sent.length,2);collector.close();advance(10000);assert.equal(sent.length,3);assert.equal(sent[2].p.furthest_page,2);collector.reached(1);advance(20000);assert.equal(sent.length,3);
});
test('transport omits credentials and never stores the token',async()=>{
  const calls=[];const {sendReach,reachTabToken}=loadModule('src/features/reads/reachCollector.ts',{fetch:async(...args)=>{calls.push(args);return new Response();}});sendReach(payload());assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].keepalive,true);assert.equal(reachTabToken(),reachTabToken());assert.doesNotMatch(read('src/features/reads/reachCollector.ts'),/sessionStorage|localStorage/);
});

test('weekly note is idempotent, nonempty only, and anchored to Sunday even after UTC midnight',async()=>{
  const f=fixture();const sunday=Date.parse('2026-10-04T12:00:00Z'),monday=Date.parse('2026-10-05T01:00:00Z');
  await ingest(f,{furthest_page:2},sunday);await ingest(f,{furthest_page:2},monday);
  class Clock extends Date {constructor(...args){super(...(args.length?args:[monday]));}static now(){return monday;}}
  const timed=loadModule('src/server/projectReach.ts',{Date:Clock});
  for(let i=0;i<2;i++)assert.equal((await timed.handleReachRead(request('/api/reach/weekly',{week:'2026-10-04'},ids.owner),f.db,f.config)).status,200);
  const notes=f.sqlite.prepare('SELECT * FROM project_weekly_notes').all();assert.equal(notes.length,1);assert.equal(notes[0].opened,1);assert.equal(notes[0].finished,1);
  const empty=fixture();await timed.handleReachRead(request('/api/reach/weekly',{week:'2026-10-04'},ids.owner),empty.db,empty.config);assert.equal(empty.sqlite.prepare('SELECT count(*) n FROM project_weekly_notes').get().n,0);
});

test('notification acknowledgement matches revision; a later coalesced save becomes unread again',async()=>{
  const f=fixture(),target={projectId:ids.project,attachmentId:ids.attachment,pageIndex:1};
  const first=await api.preparePageAction(request('/x',{},ids.other),f.db,f.config,{id:ids.other},target,'save',null);await first.run();
  const firstAt=new Date(Date.now()-3600000).toISOString();f.sqlite.prepare('UPDATE project_page_actions SET at=?').run(firstAt);
  const get=async()=>await (await api.handleReachRead(request('/api/reach/notifications',undefined,ids.owner),f.db,f.config)).json();
  let notes=await get();assert.equal(notes.length,1);assert.equal(notes[0].isUnread,true);
  await api.handleReachRead(request('/api/reach/read',{id:notes[0].id,revision:notes[0].timestamp},ids.owner),f.db,f.config);notes=await get();assert.equal(notes[0].isUnread,false);
  const secondUser='30000000-0000-4000-8000-000000000003';const second=await api.preparePageAction(request('/x',{},secondUser),f.db,f.config,{id:secondUser},target,'save',null);await second.run();
  notes=await get();assert.equal(notes.length,1);assert.equal(notes[0].isUnread,true);assert.equal(notes[0].id.startsWith('d1:page:'),true);
  await api.handleReachRead(request('/api/reach/read',{id:notes[0].id,revision:notes[0].timestamp},ids.owner),f.db,f.config);
  f.sqlite.prepare('DELETE FROM project_page_actions WHERE actor_account_id=?').run(ids.other);
  notes=await get();assert.equal(notes.length,1);assert.equal(notes[0].isUnread,false);
});

test('sampled retention removes raw events after30days and rollups after13months',async()=>{
  const f=fixture();await ingest(f,{},Date.parse('2024-01-01T12:00:00Z'));await ingest(f,{},Date.parse('2026-07-01T12:00:00Z'));
  assert.equal((await api.ingestReach(request('/api/reach',payload()),f.db,f.config,{now:()=>now,random:()=>0})).status,204);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_reach_events').get().n,1);
  assert.deepEqual(f.sqlite.prepare('SELECT day FROM project_reach_daily ORDER BY day').all().map(r=>r.day),['2026-07-01','2026-10-04']);
});

test('combined notifications preserve legacy entries when D1 is unavailable and reject switched-account acknowledgements',async()=>{
  let account=ids.owner,fail=false;const calls=[];
  const legacy={listNotifications:async()=>[{id:'legacy',timestamp:'2026-09-30T01:00:00Z',isUnread:false}],markRead:async()=>{},markAllRead:async()=>{},subscribeToNotifications:()=>()=>{}};
  const service=loadModule('src/services/supabase/readSignalService.ts',{require:id=>{
    if(id==='./client')return{requireSupabase:()=>({auth:{getSession:async()=>({data:{session:{user:{id:account}}}})}})};
    if(id.includes('mediaInteractionRequest'))return{mediaInteractionRequest:async(path,init,required,expected)=>{calls.push({path,init,expected});if(fail)throw Error('Not installed');return[{id:'d1:page:fixture',timestamp:'2026-09-30T02:00:00Z',isUnread:true}];}};
    throw Error(id);
  }}).withPageNotifications(legacy);
  assert.equal((await service.listNotifications()).length,2);account=ids.other;await service.markRead('d1:page:fixture');assert.equal(calls.length,1);
  fail=true;assert.equal((await service.listNotifications()).length,1);
});

test('private retry revokes an uncertain named save atomically and works before migration',async()=>{
  const f=fixture(),target={projectId:ids.project,attachmentId:ids.attachment,pageIndex:1};
  const bookmark=(g)=>g.db.prepare("INSERT OR IGNORE INTO media_engagements(account_id,project_id,attachment_id,page_index,kind) VALUES(?,?,?,?,?)").bind(ids.other,ids.project,ids.attachment,1,'save');
  const named=await api.preparePageAction(request('/x',{},ids.other),f.db,f.config,{id:ids.other},target,'save',null);
  await f.db.batch([bookmark(f),named]); // Response lost after this commit.
  await api.savePagePrivately(f.db,bookmark(f),ids.other,target);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM media_engagements').get().n,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_page_actions').get().n,0);
  const old=fixture({pending:false});await api.savePagePrivately(old.db,bookmark(old),ids.other,target);
  assert.equal(old.sqlite.prepare('SELECT count(*) n FROM media_engagements').get().n,1);
});
