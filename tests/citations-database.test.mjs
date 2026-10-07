import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('pending citation migrations enforce access, identity and ownership in PostgreSQL',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;
 create table profiles(id uuid primary key,account_id uuid,name text,handle text default 'synthetic',show_journey boolean default false,is_private boolean default false);
 create table portfolio_categories(id uuid primary key,profile_id uuid references profiles(id),is_hidden boolean default false);
 create table projects(id uuid primary key,profile_id uuid references profiles(id),category_id uuid references portfolio_categories(id),title text,summary text,is_hidden boolean default false,published_at timestamptz default now());
 create table project_attachments(id text primary key,project_id uuid references projects(id),kind text,position integer,storage_path text,metadata jsonb);
 create table notifications(id uuid primary key default gen_random_uuid(),account_id uuid,body text);
 create function owns_profile(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=p_id and account_id=auth.uid())$$;
 create function update_project(uuid,uuid,text,text,jsonb,jsonb,text) returns jsonb language sql as $$select '{}'::jsonb$$;
 alter table projects enable row level security;alter table project_attachments enable row level security;
 create policy projects_read on projects for select to anon,authenticated using(not is_hidden or owns_profile(profile_id));
 create policy attachments_read on project_attachments for select to anon,authenticated using(exists(select 1 from projects p where p.id=project_id));
 grant select on profiles,portfolio_categories,projects,project_attachments to anon,authenticated;
 alter default privileges in schema public grant all on tables to anon,authenticated;
 alter table profiles add column headline text default '',add column location text default '',add column avatar_url text default '',add column nav_heading text default '',add column stats jsonb default '[]',add column social_links jsonb default '{}',add column links jsonb default '[]',add column public_appearance jsonb,add column project_grid_columns integer default 3;
 alter table portfolio_categories add column label text default '',add column icon_name text default '',add column format text default '',add column blurb text default '',add column position integer default 0;
 alter table projects add column design jsonb default '{}',add column position integer default 0,add column is_pinned boolean default false,add column revision uuid default gen_random_uuid(),add column topic_keys text[] default '{}',add column content_location text,add column geographic_scope text default '',add column geography_confidence numeric default 0;
 alter table project_attachments add column is_cover boolean default false,add column file_name text default '',add column display_name text default '',add column extension text default '',add column mime_type text default '',add column size_bytes bigint default 0,add column type_label text default '',add column status text default 'ready';
 create function shared_profile_bundle(uuid) returns jsonb language sql as $$select null::jsonb$$;
 -- A malformed pre-existing attachment must not abort the backfill.
 insert into project_attachments(id,kind,metadata) values('legacy-malformed','document','{"pageCount":"12 pages"}');
 insert into profiles(id,name) values('00000000-0000-4000-8000-000000000099','Existing');

 `);
 for(const path of ['202610070001_citation_foundation.sql','202610070002_human_citations.sql'])await db.exec(readFileSync(`supabase/migrations/${path}`,'utf8'));
 for(let n=1;n<=3;n++){await db.query('insert into profiles(id,account_id,name) values($1,$1,$2)',[id(n),`Synthetic ${n}`]);await db.query('insert into portfolio_categories(id,profile_id) values($1,$2)',[id(n+10),id(n)]);await db.query('insert into projects(id,profile_id,category_id,title,published_at) values($1,$2,$3,$4,$5)',[id(n+20),id(n),id(n+10),`Work ${n}`,'2020-03-04T12:00:00Z']);}
 await db.query("insert into project_attachments(id,project_id,kind,position,storage_path,metadata) values('image-a',$1,'image',0,'safe/image.png','{}')",[id(21)]);
 await db.query("insert into project_attachments(id,project_id,kind,position,storage_path,metadata) values('doc-a',$1,'document',1,'safe/doc.pdf','{\"pageCount\":2,\"renderedPages\":[{\"withinDocumentIndex\":1,\"storagePath\":\"safe/page1.webp\"}]}')",[id(21)]);
 const page=(await db.query("select id from project_pages where attachment_id='doc-a' and source_page_number=1")).rows[0].id;
 const role=async(n)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);await db.exec(n?'set role authenticated':'set role anon');};
 await role(null);assert.equal((await db.query("select resolve_citation_item('image-a',true) as item")).rows[0].item,null);assert.equal((await db.query('select * from project_pages')).rows.length,0);assert.equal((await db.query('select * from citable_images')).rows.length,0);
 assert.equal((await db.query("select resolve_citation_item('image-a',false) as item")).rows[0].item.creator,'Synthetic 1');assert.equal((await db.query("select resolve_citation_item('unknown',false) as item")).rows[0].item,null);
 await role(2);const insert=()=>db.query("insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,'image-a',$2,$3) returning id",[id(22),id(2),id(1)]);
 const citation=(await insert()).rows[0].id;await assert.rejects(insert(),/unique/);assert.equal((await db.query('select * from citations')).rows.length,1);
 await db.query('update citations set note=$1 where id=$2',['A note',citation]);await assert.rejects(db.query('update citations set note=$1 where id=$2',['x'.repeat(141),citation]),/check/);
 await assert.rejects(db.query("insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,'image-a',$2,$3)",[id(23),id(2),id(1)]),/unavailable/);
 await role(1);await assert.rejects(db.query("insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,'image-a',$2,$2)",[id(21),id(1)]),/unavailable/);
 await role(3);assert.equal((await db.query('delete from citations where id=$1 returning id',[citation])).rows.length,0);
 await db.exec('reset role');assert.equal((await db.query('select count(*) as n from notifications')).rows[0].n,1);await db.query('update projects set citation_permitted=true,title=$2 where id=$1',[id(21),'Retitled']);await db.query("update project_attachments set position=9,metadata=metadata where id='doc-a'");assert.equal((await db.query("select id from project_pages where attachment_id='doc-a' and source_page_number=1")).rows[0].id,page);
 assert.equal((await db.query('select made_on::text from projects where id=$1',[id(21)])).rows[0].made_on,'2020-03-04');
 await role(null);assert.equal((await db.query('select * from project_pages')).rows.length,2);
 await db.exec('reset role');await db.query('update projects set is_hidden=true where id=$1',[id(21)]);
 await role(3);assert.equal((await db.query('select * from citations')).rows.length,0);assert.equal((await db.query("select resolve_citation_item('image-a',false) as item")).rows[0].item,null);assert.equal((await db.query('select * from citable_images')).rows.length,0);
 await role(1);assert.equal((await db.query('select * from citations')).rows.length,1);await role(2);assert.equal((await db.query('select * from citations')).rows.length,1);await db.query('delete from citations where id=$1',[citation]);
 await db.exec('reset role');assert.equal((await db.query('select count(*) as n from notifications')).rows[0].n,1);
 // One safe parser governs backfill, trigger, both public resolvers and target.
 for(const value of ['12 pages','null',null,-1,1.5,'1234567890',{},'']){
  assert.equal((await db.query('select attachment_page_count($1::jsonb) as n',[JSON.stringify({pageCount:value})])).rows[0].n,0);
  await db.query("update project_attachments set metadata=$1::jsonb where id='doc-a'",[JSON.stringify({pageCount:value})]);
  assert.equal((await db.query('select resolve_public_page_id($1,1) as id',['doc-a'])).rows[0].id,null);
  assert.equal((await db.query('select resolve_citation_item($1,false) as item',[page])).rows[0].item,null);
  assert.equal((await db.query('select * from citation_target($1)',[page])).rows.length,0);
 }
 await db.query(`update project_attachments set metadata='{"pageCount":"999999999"}' where id='doc-a'`);
 assert.equal((await db.query("select count(*) as n from project_pages where attachment_id='doc-a'")).rows[0].n,5000);
 assert.equal((await db.query("select id from project_pages where attachment_id='doc-a' and source_page_number=1")).rows[0].id,page);
 await db.query(`update project_attachments set metadata='{"pageCount":2}' where id='doc-a'`);
 await assert.rejects(db.query('update projects set made_on=$1 where id=$2',['1899-12-31',id(22)]),/check/);
 await assert.rejects(db.query("update projects set made_on=current_date+2 where id=$1",[id(22)]),/check/);
 assert.equal((await db.query('select show_journey from profiles where id=$1',[id(99)])).rows[0].show_journey,false);
 assert.equal((await db.query('select show_journey from profiles where id=$1',[id(2)])).rows[0].show_journey,true);
 // A hidden citing project is readable only by the two creators, never counted publicly.
 await db.query('update projects set is_hidden=false where id=$1',[id(21)]);
 await db.query('update projects set is_hidden=true where id=$1',[id(22)]);
 await role(2);const draftCitation=(await insert()).rows[0].id;
 await db.exec('reset role');assert.equal((await db.query('select count(*) as n from notifications')).rows[0].n,1);
 for(const viewer of [null,3]){await role(viewer);assert.equal((await db.query('select * from citations')).rows.length,0);assert.equal((await db.query("select public_cited_in('image-a') as rows")).rows[0].rows.length,0);}
 for(const viewer of [1,2]){await role(viewer);assert.equal((await db.query('select * from citations')).rows.length,1);assert.equal((await db.query("select public_cited_in('image-a') as rows")).rows[0].rows.length,0);}
 await db.exec('reset role');await db.query('update projects set is_hidden=false where id=$1',[id(22)]);
 assert.equal((await db.query('select count(*) as n from notifications')).rows[0].n,2);
 assert.equal((await db.query('select target_path from notifications where citation_id=$1',[draftCitation])).rows[0].target_path,`/p/${id(2)}/c/${id(12)}/${id(22)}`);
 await db.query('update projects set is_hidden=true where id=$1',[id(22)]);await db.query('update projects set is_hidden=false where id=$1',[id(22)]);
 assert.equal((await db.query('select count(*) as n from notifications')).rows[0].n,2);
 await role(null);assert.equal((await db.query("select public_cited_in('image-a') as rows")).rows[0].rows.length,1);
 const bundle=(await db.query('select shared_profile_bundle($1) as bundle',[id(2)])).rows[0].bundle;
 assert.equal(bundle.citations.length,1);assert.equal(bundle.citations[0].direction,'outgoing');assert.equal(bundle.citations[0].item_id,'image-a');assert.equal(bundle.citations[0].other_creator_name,'Synthetic 1');
 assert.equal((await db.query('select shared_profile_bundle($1) as bundle',[id(1)])).rows[0].bundle.citations[0].direction,'incoming');
 await db.exec('reset role');
 for(const parent of ['portal','creator']){
  if(parent==='portal')await db.query('update portfolio_categories set is_hidden=true where id=$1',[id(12)]);
  else await db.query('update profiles set is_private=true where id=$1',[id(2)]);
  await role(3);assert.equal((await db.query('select * from citations')).rows.length,0);assert.equal((await db.query("select public_cited_in('image-a') as rows")).rows[0].rows.length,0);
  await db.exec('reset role');await db.query('update portfolio_categories set is_hidden=false where id=$1',[id(12)]);await db.query('update profiles set is_private=false where id=$1',[id(2)]);
 }
 // Bundle ordering uses made_on first, publication date only as a tie breaker.
 await db.query('insert into projects(id,profile_id,category_id,title,made_on,published_at) values($1,$2,$3,$4,$5,$6)',[id(24),id(2),id(12),'Older publication, newer work','2021-01-01','2010-01-01']);
 await role(null);assert.equal((await db.query('select shared_profile_bundle($1) as bundle',[id(2)])).rows[0].bundle.projects[0].id,id(24));
 await db.exec('reset role');await db.query('update profiles set show_outgoing_citations=false where id=$1',[id(2)]);
 await role(null);assert.equal((await db.query('select shared_profile_bundle($1) as bundle',[id(2)])).rows[0].bundle.citations.length,0);
 await db.exec('reset role');
 // Individual page and image deletion leave no ghost references.
 await role(2);await db.query('insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,$2,$3,$4)',[id(22),page,id(2),id(1)]);
 await db.exec('reset role');await db.query('delete from project_pages where id=$1',[page]);assert.equal((await db.query('select * from citations where cited_item_id=$1',[page])).rows.length,0);
 const secondPage=(await db.query("select id from project_pages where attachment_id='doc-a' and source_page_number=2")).rows[0].id;
 await role(2);await db.query('insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,$2,$3,$4)',[id(22),secondPage,id(2),id(1)]);
 await db.exec('reset role');await db.query("delete from project_attachments where id='doc-a'");assert.equal((await db.query('select * from citations where cited_item_id=$1',[secondPage])).rows.length,0);

 await db.query("delete from project_attachments where id='image-a'");assert.equal((await db.query('select * from citations')).rows.length,0);
 // Creator FKs have explicit cascade actions in both directions.
 const fks=(await db.query("select confdeltype from pg_constraint where conrelid='citations'::regclass and confrelid='profiles'::regclass")).rows;
 assert.equal(fks.length,2);assert.ok(fks.every(row=>row.confdeltype==='c'));
 // Isolate profile deletion from unrelated application-owned parent FKs.
 await db.query("insert into project_attachments(id,project_id,kind,position,storage_path,metadata) values('image-b',$1,'image',0,'safe/b.png','{}')",[id(21)]);
 await role(2);await db.query("insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,'image-b',$2,$3)",[id(22),id(2),id(1)]);
 await db.exec('reset role');await db.query('update projects set profile_id=null where id=$1',[id(21)]);await db.query('update portfolio_categories set profile_id=null where id=$1',[id(11)]);await db.query('delete from profiles where id=$1',[id(1)]);assert.equal((await db.query('select * from citations')).rows.length,0);
 await db.query("insert into project_attachments(id,project_id,kind,position,storage_path,metadata) values('image-c',$1,'image',0,'safe/c.png','{}')",[id(23)]);
 await role(2);await db.query("insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,'image-c',$2,$3)",[id(22),id(2),id(3)]);
 await db.exec('reset role');await db.query('update projects set profile_id=null where profile_id=$1',[id(2)]);await db.query('update portfolio_categories set profile_id=null where profile_id=$1',[id(2)]);await db.query('delete from profiles where id=$1',[id(2)]);assert.equal((await db.query('select * from citations')).rows.length,0);

 await db.query("insert into profiles(id,account_id,name) values($1,$1,'Fourth')",[id(4)]);
 await db.query('insert into portfolio_categories(id,profile_id) values($1,$2)',[id(14),id(4)]);
 await db.query("insert into projects(id,profile_id,category_id,title) values($1,$2,$3,'Citing work')",[id(44),id(4),id(14)]);
 await role(4);await db.query("insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,'image-c',$2,$3)",[id(44),id(4),id(3)]);await db.exec('reset role');
 // Reproduce the production notification constraint omitted by the initial fixture.
 await db.query('delete from notifications');
 await db.exec("alter table notifications add constraint notifications_kind_check check(kind in ('message','reply','follow','system'))");
 await db.exec(readFileSync('supabase/migrations/202610070003_opaque_image_citations.sql','utf8'));
 await db.exec("insert into notifications(account_id,body,kind) values(null,'Citation test','citation')");
 const opaque=(await db.query("select citation_id from project_attachments where id='image-c'")).rows[0].citation_id;
 assert.match(opaque,/^[0-9a-f-]{36}$/);
 assert.equal((await db.query('select cited_item_id from citations')).rows[0].cited_item_id,opaque);
 assert.equal((await db.query("select resolve_citation_item('image-c',false) as item")).rows[0].item,null);
 const resolved=(await db.query('select resolve_citation_item($1,false) as item',[opaque])).rows[0].item;
 assert.equal(resolved.id,opaque);
 await db.query("update projects set title='Retitled' where id=$1",[id(23)]);
 await db.query("update project_attachments set position=20 where id='image-c'");
 assert.equal((await db.query("select citation_id from project_attachments where id='image-c'")).rows[0].citation_id,opaque);
 await assert.rejects(db.query("update project_attachments set citation_id=gen_random_uuid() where id='image-c'"),/immutable/);
 await db.query("delete from project_attachments where id='image-c'");assert.equal((await db.query('select * from citations')).rows.length,0);
 await db.query("insert into project_attachments(id,project_id,kind,position,storage_path,metadata) values('opaque-doc',$1,'document',0,'safe/document.pdf','{\"pageCount\":2}')",[id(23)]);
 const persistentPage=(await db.query("select id from project_pages where attachment_id='opaque-doc' and source_page_number=2")).rows[0].id;
 await db.query('update projects set is_hidden=true where id=$1',[id(44)]);
 await role(4);const deferred=(await db.query('insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,$2,$3,$4) returning id',[id(44),persistentPage,id(4),id(3)])).rows[0].id;
 await db.exec('reset role');assert.equal((await db.query('select id from notifications where citation_id=$1',[deferred])).rows.length,0);
 await db.query('update projects set is_hidden=false where id=$1',[id(44)]);
 assert.equal((await db.query('select kind from notifications where citation_id=$1',[deferred])).rows[0].kind,'citation');
 const deferredNotification=(await db.query('select id from notifications where citation_id=$1',[deferred])).rows[0].id;
 await db.query("update project_attachments set position=8 where id='opaque-doc'");
 assert.equal((await db.query("select id from project_pages where attachment_id='opaque-doc' and source_page_number=2")).rows[0].id,persistentPage);
 await db.query('delete from project_pages where id=$1',[persistentPage]);assert.equal((await db.query('select * from citations where id=$1',[deferred])).rows.length,0);
 assert.equal((await db.query('select id from notifications where id=$1',[deferredNotification])).rows.length,0);
 // Direct citation deletion and citing-project cascade both remove the original
 // notification row, rather than merely setting its citation_id to null.
 const remainingPage=(await db.query("select id from project_pages where attachment_id='opaque-doc' and source_page_number=1")).rows[0].id;
 await role(4);
 const direct=(await db.query('insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,$2,$3,$4) returning id',[id(44),remainingPage,id(4),id(3)])).rows[0].id;
 await db.exec('reset role');
 const directNotification=(await db.query('select id from notifications where citation_id=$1',[direct])).rows[0].id;
 await role(4);await db.query('delete from citations where id=$1',[direct]);await db.exec('reset role');
 assert.equal((await db.query('select id from notifications where id=$1',[directNotification])).rows.length,0);
 await role(4);
 const projectCitation=(await db.query('insert into citations(citing_project_id,cited_item_id,citing_creator_id,cited_creator_id) values($1,$2,$3,$4) returning id',[id(44),remainingPage,id(4),id(3)])).rows[0].id;
 await db.exec('reset role');
 const projectNotification=(await db.query('select id from notifications where citation_id=$1',[projectCitation])).rows[0].id;
 const unrelated=(await db.query("insert into notifications(account_id,body,kind) values(null,'Unrelated system notice','system') returning id")).rows[0].id;
 await db.query('delete from projects where id=$1',[id(44)]);
 assert.equal((await db.query('select id from citations where id=$1',[projectCitation])).rows.length,0);
 assert.equal((await db.query('select id from notifications where id=$1',[projectNotification])).rows.length,0);
 assert.equal((await db.query('select id from notifications where id=$1',[unrelated])).rows.length,1);
 }finally{await db.close();}
});
