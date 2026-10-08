import test from 'node:test';
import assert from 'node:assert/strict';
import {mcpFixture} from './helpers/mcp-database.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('MCP SQL: citable-only reads, scoped external write, dedupe, notification and private hiding',async()=>{
 const {db,page}=await mcpFixture();try{
 const hash='a'.repeat(64),rpc=()=>db.query('select record_external_citation($1,$2,$3) id',[page,hash,'Lecture notes']);
 await db.exec('set role anon');
 const results=(await db.query("select search_citable_items('damping') items")).rows[0].items;
 assert.equal(results.length,2);assert.ok(results.every(r=>r.projectId===id(21)&&r.citable===true));
 assert.equal((await db.query("select mcp_citation_item('unknown') item")).rows[0].item,null);
 const blocked=(await db.query("select id from project_pages where attachment_id='doc2' limit 1")).rows;
 assert.equal(blocked.length,0);
 await assert.rejects(rpc(),/permission denied/);
 await db.exec('reset role');
 const publicPage=(await db.query("select id from project_pages where attachment_id='doc2' limit 1")).rows[0].id;
 const privatePage=(await db.query("select id from project_pages where attachment_id='doc3' limit 1")).rows[0].id;
 for(const p of [publicPage,privatePage])assert.equal((await db.query('select mcp_citation_item($1) item',[p])).rows[0].item,null);
 await db.exec("select set_config('request.jwt.claim.role','service_role',false); set role service_role;");
 await assert.rejects(db.query('select record_external_citation($1,$2,null)',[publicPage,hash]),/unavailable/);
 const first=(await rpc()).rows[0].id;assert.equal((await rpc()).rows[0].id,first);
 await assert.rejects(db.query('select record_external_citation($1,$2,$3)',[page,hash,'x'.repeat(141)]),/invalid/);
 for(let n=0;n<60;n++)assert.equal((await db.query('select mcp_allow_request($1) allowed',[hash])).rows[0].allowed,true);
 assert.equal((await db.query('select mcp_allow_request($1) allowed',[hash])).rows[0].allowed,false);
 await db.exec('reset role');
 assert.equal((await db.query('select * from citations')).rows.length,1);
 const notifications=(await db.query('select * from notifications')).rows;
 assert.equal(notifications.length,1);assert.equal(notifications[0].body,'Someone cited page 1 of Damping 1 in a document outside Portalink.');assert.equal(notifications[0].target_path,`/cite/${page}`);assert.equal(notifications[0].actor_profile_id,null);
 assert.equal((await db.query('select public_cited_in($1) rows',[page])).rows[0].rows[0].source,'external');
 assert.equal((await db.query('select public_profile_citations($1) rows',[id(1)])).rows[0].rows[0].context,'Lecture notes');
 await db.query('update profiles set is_private=true where id=$1',[id(1)]);
 await db.exec('set role anon');assert.equal((await db.query('select * from citations')).rows.length,0);assert.equal((await db.query('select public_cited_in($1) rows',[page])).rows[0].rows.length,0);
 await db.exec('reset role');await db.query('delete from citations where id=$1',[first]);assert.equal((await db.query('select * from notifications')).rows.length,0);
 }finally{await db.close();}
});
test('MCP SQL preserves human citations, rejects spoofed receipts, and expires dedupe',async()=>{
 const {db,page}=await mcpFixture();try{
 const hash='b'.repeat(64);
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);select set_config('request.jwt.claim.role','authenticated',false);set role authenticated;");
 await assert.rejects(db.query("insert into citations(cited_item_id,cited_creator_id,source) values($1,$2,'external')",[page,id(1)]),/unavailable|row-level security|permission denied/);
 const human=(await db.query("insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id,source) values($1,$2,$3,$4,'app') returning id",[id(22),page,id(2),id(1)])).rows[0].id;
 assert.ok(human);
 await db.exec("reset role;select set_config('request.jwt.claim.role','service_role',false);set role service_role");
 const first=(await db.query('select record_external_citation($1,$2,null) id',[page,hash])).rows[0].id;
 await db.exec('reset role');await db.query("update external_citation_dedupe set at=now()-interval '11 minutes' where citation_id=$1",[first]);
 await db.exec('set role service_role');const second=(await db.query('select record_external_citation($1,$2,null) id',[page,hash])).rows[0].id;
 assert.notEqual(second,first);await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,3);
 await db.query('update projects set citation_permitted=false where id=$1',[id(21)]);
 await db.exec('set role service_role');await assert.rejects(db.query('select record_external_citation($1,$2,null)',[page,hash]),/unavailable/);
 }finally{await db.close();}
});

test('MCP SQL search uses relevance/date, portal/creator filters and opaque image IDs',async()=>{
 const {db,page}=await mcpFixture();try{
 await db.query("insert into project_attachments(id,project_id,kind,position,storage_path,metadata) values('private-storage-path',$1,'image',1,'safe/image.webp','{}')",[id(21)]);
 const image=(await db.query("select citation_id from project_attachments where id='private-storage-path'")).rows[0].citation_id;
 await db.exec('set role anon');
 const rows=(await db.query("select search_citable_items('Engineering','engineering','CREATOR1',10) items")).rows[0].items;
 assert.equal(rows.length,3);assert.ok(rows.some(i=>i.id===image&&i.kind==='image'));assert.ok(rows.some(i=>i.id===page));
 assert.equal((await db.query("select search_citable_items('damping',null,'creator2',10) items")).rows[0].items.length,0);
 assert.equal((await db.query("select mcp_citation_item($1) item",[image])).rows[0].item.id,image);
 await db.exec('reset role');await db.query('update portfolio_categories set is_hidden=true where id=$1',[id(11)]);
 await db.exec('set role anon');assert.equal((await db.query("select search_citable_items('damping') items")).rows[0].items.length,0);
 }finally{await db.close();}
});
