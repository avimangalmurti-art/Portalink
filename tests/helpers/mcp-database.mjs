import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH?pathToFileURL(process.env.PGLITE_MODULE_PATH).href:'@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function mcpFixture(){
 const db=new PGlite();
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


 create role service_role;
 alter table projects add column cover_thumbnail jsonb;
 `);
 for(const path of ['202610070001_citation_foundation.sql','202610070002_human_citations.sql','202610070003_opaque_image_citations.sql'])await db.exec(readFileSync(`supabase/migrations/${path}`,'utf8'));
 await db.exec(readFileSync('supabase/pending/202610080002_external_citations_mcp.sql','utf8'));
 for(let n=1;n<=3;n++){
  await db.query('insert into profiles(id,account_id,name,handle) values($1,$1,$2,$3)',[id(n),`Creator ${n}`,`creator${n}`]);
  await db.query('insert into portfolio_categories(id,profile_id,label) values($1,$2,$3)',[id(n+10),id(n),'Engineering']);
  await db.query('insert into projects(id,profile_id,category_id,title,summary,citation_permitted,is_hidden,made_on) values($1,$2,$3,$4,$5,$6,$7,$8)',[id(n+20),id(n),id(n+10),`Damping ${n}`,'Structural damping',n===1,n===3,`2020-01-0${n}`]);
  await db.query('insert into project_attachments(id,project_id,kind,position,storage_path,metadata) values($1,$2,$3,0,$4,$5)',[`doc${n}`,id(n+20),'document',`safe/doc${n}.pdf`,{pageCount:2,renderedPages:[{withinDocumentIndex:1,storagePath:`safe/page${n}.webp`}]}]);
 }
 const page=(await db.query("select id from project_pages where attachment_id='doc1' and source_page_number=1")).rows[0].id;
 return {db,page};
}
