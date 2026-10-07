import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const journey = {};
vm.runInNewContext(ts.transpileModule(read('../src/features/journey/journey.ts'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:journey});
const exports = {};
vm.runInNewContext(ts.transpileModule(read('../src/services/supabase/sharedProfileBundle.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports, require: name => { assert.equal(name, '../../features/journey/journey'); return journey; } });
const { parseSharedProfileBundle, readSharedProfileBundle, isMissingSharedProfileBundleRpc } = exports;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  return {
    profile: { id: id(11), account_id: id(1), name: 'Public', handle: 'public', headline: '', location: '', avatar_url: '', nav_heading: 'Projects', stats: [], social_links: {}, links: [], is_private: false },
    categories: [{ id: id(21), profile_id: id(11), label: 'Projects', icon_name: 'grid', format: 'grid', blurb: '', position: 0, is_hidden: false }],
    projects: [{ id: id(31), profile_id: id(11), category_id: id(21), title: 'Work', summary: '', design: {}, position: 0, is_hidden: false, is_pinned: false, published_at: '2026-09-01T00:00:00Z', revision: id(99), cover_thumbnail: null, page_count: 7, kind: 'document' }],
    attachments: [{ id: 'legacy/path/cover.pdf', project_id: id(31), kind: 'document', file_name: 'cover.pdf', display_name: 'Cover', extension: 'pdf', mime_type: 'application/pdf', size_bytes: 1, type_label: 'PDF', storage_path: 'cover.pdf', status: 'ready', is_cover: true, position: 0, metadata: { pageCount: 7 } }],
  };
}

test('bundle parser keeps public fields and text attachment IDs, with page count independent of hydration', () => {
  const result = parseSharedProfileBundle(fixture(), id(11));
  assert.equal(result.profile.account_id, undefined);
  assert.equal(result.projects[0].page_count, 7);
  assert.equal(result.projects[0].kind, 'document');
  const emptyKind = fixture(); emptyKind.projects[0].kind = null;
  assert.equal(parseSharedProfileBundle(emptyKind, id(11)).projects[0].kind, null);
  assert.equal(result.attachments[0].id, 'legacy/path/cover.pdf');
  assert.equal(parseSharedProfileBundle(null, id(11)), null);
});

test('bundle rejects mixed-profile, hidden, duplicate, foreign, unbounded and malformed rows', () => {
  const mutations = [
    value => { value.profile.id = id(12); }, value => { value.profile.is_private = true; },
    value => { value.categories[0].profile_id = id(12); }, value => { value.categories[0].is_hidden = true; },
    value => { value.categories.push(clone(value.categories[0])); },
    value => { value.projects[0].category_id = id(22); }, value => { value.projects[0].is_hidden = true; },
    value => { delete value.projects[0].cover_thumbnail; }, value => { value.projects[0].page_count = -1; },
    value => { value.projects[0].kind = 'invalid'; },
    value => { value.projects[0].revision = 'bad'; }, value => { value.projects[0].published_at = 'bad'; },
    value => { value.attachments[0].project_id = id(32); },
    value => { value.attachments.push({ ...value.attachments[0] }); },
    value => { value.attachments.push({ ...value.attachments[0], id: 'b' }, { ...value.attachments[0], id: 'c' }); },
  ];
  for (const mutate of mutations) { const value = fixture(); mutate(value); assert.throws(() => parseSharedProfileBundle(value, id(11)), /response is invalid/); }
});

test('only a missing shared_profile_bundle RPC permits the legacy reader', async () => {
  for (const error of [
    { code: 'PGRST202', message: 'Could not find the function public.shared_profile_bundle(profile_id) in the schema cache' },
    { code: '42883', message: 'function public.shared_profile_bundle(uuid) does not exist' },
  ]) {
    assert.equal(isMissingSharedProfileBundleRpc(error), true);
    assert.equal((await readSharedProfileBundle({ rpc: async () => ({ data: null, error }) }, id(11))).status, 'unsupported');
  }
  for (const error of [
    { code: '42501', message: 'permission denied for function shared_profile_bundle(uuid)' },
    { code: '42883', message: 'function public.some_dependency(uuid) does not exist' },
    { code: '42883', message: 'function public.some_dependency(uuid) does not exist; context function public.shared_profile_bundle(uuid)' },
    { code: 'PGRST202', message: 'Could not find the function public.other_rpc(profile_id) in the schema cache' },
    { code: 'PGRST301', message: 'JWT expired' }, { message: 'Network failed' },
  ]) {
    assert.equal(isMissingSharedProfileBundleRpc(error), false);
    await assert.rejects(readSharedProfileBundle({ rpc: async () => ({ data: null, error }) }, id(11)), new RegExp(error.message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  await assert.rejects(readSharedProfileBundle({ rpc: async () => ({ data: {}, error: null }) }, id(11)), /response is invalid/);
  let called = false;
  await assert.rejects(readSharedProfileBundle({ rpc: async () => { called = true; } }, 'invalid'), /valid profile ID/);
  assert.equal(called, false);
  const available = await readSharedProfileBundle({ rpc: async (name, args) => {
    assert.equal(name, 'shared_profile_bundle'); assert.equal(args.profile_id, id(11)); return { data: null, error: null };
  } }, id(11));
  assert.equal(available.status, 'available'); assert.equal(available.bundle, null);
});

const modulePath = process.env.PGLITE_MODULE_PATH ?? process.env.PGLITE_MODULE;
test('isolated SQL covers public bundle, private fallback, immutable paths, revisions and privacy transitions', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const setRole = async (role, account = null) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [account ? id(account) : '']);
    await db.query("select set_config('request.jwt.claim.role',$1,false)", [role]);
    await db.exec(`set role ${role}`);
  };
  const bundle = async profile => (await db.query('select public.shared_profile_bundle($1) as value', [id(profile)])).rows[0].value;
  const revision = async () => (await db.query('select revision from projects where id=$1', [id(31)])).rows[0].revision;
  const manifest = (bucket = 'project-media', hash = 'a'.repeat(64)) => ({ version: 1, bucket, sourceAttachmentId: 'legacy/cover.pdf', sourceKey: 'b'.repeat(64), frameBaked: true,
    variants: [200, 400, 800].map(size => ({ size, path: `${id(11)}/${id(31)}/${hash}/${size}.webp`, width: size, height: size / 2 })) });
  const persist = async (value, expected) => (await db.query('select public.set_project_cover_thumbnail($1,$2,$3) as revision', [id(31), expected ?? await revision(), value])).rows[0].revision;
  const insertVariants = async value => { for (const variant of value.variants) await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [value.bucket, variant.path]); };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage; create schema realtime;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',owner uuid,owner_id text);
      create function storage.foldername(path text) returns text[] language sql immutable as $$select (string_to_array(path,'/'))[1:array_length(string_to_array(path,'/'),1)-1]$$;
      create table realtime.messages(id uuid primary key default gen_random_uuid(),extension text);
      create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
      alter table storage.objects enable row level security; alter table realtime.messages enable row level security;
      grant usage on schema public,auth,storage,realtime to anon,authenticated,service_role;
      grant select on storage.objects to anon; grant all on storage.objects to authenticated,service_role;
      grant select,insert on realtime.messages to authenticated;
      create publication supabase_realtime;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    `);
    for (const name of readdirSync(directory).filter(name => name.endsWith('.sql') && !name.startsWith('20261007')).sort()) await db.exec(readFileSync(new URL(name, directory), 'utf8').replace(/create extension if not exists pgcrypto;/i, ''));
    for (const name of ['cover_thumbnail_schema.sql', 'project_covers_public_bucket.sql', 'shared_profile_bundle.sql']) {
      await db.exec(read(`../supabase/pending/${name}`)); await db.exec(read(`../supabase/pending/${name}`));
    }
    for (const n of [1, 2]) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `bundle${n}@example.test`]);
      await db.query('insert into profiles(id,account_id,name,handle,is_private) values($1,$2,$3,$4,$5)', [id(n + 10), id(n), `Profile ${n}`, `bundle_${n}`, n === 2]);
      await db.query("insert into portfolio_categories(id,profile_id,label) values($1,$2,'Projects')", [id(n + 20), id(n + 10)]);
    }
    await db.query("insert into portfolio_categories(id,profile_id,label,is_hidden) values($1,$2,'Hidden',true)", [id(23), id(11)]);
    for (const [project, profile, category, hidden] of [[31, 11, 21, false], [32, 12, 22, false], [33, 11, 21, true], [34, 11, 23, false]]) {
      await db.query("insert into projects(id,profile_id,category_id,title,summary,is_hidden) values($1,$2,$3,'Work','Existing',$4)", [id(project), id(profile), id(category), hidden]);
    }
    const metadata = { coverPageNumber: 2, pageCount: 7, privateFutureKey: 'excluded', coverFrame: { x: 0.5, y: 0.5, zoom: 1 }, renderedPages: [1, 2, 3].map(n => ({ attachmentId: 'legacy/cover.pdf', withinDocumentIndex: n, storagePath: `page-${n}.webp` })) };
    for (const [attachment, kind, selected, position] of [['legacy/cover.pdf', 'document', true, 0], ['fallback-image', 'image', false, 1], ['extra-image', 'image', false, 2]]) {
      await db.query("insert into project_attachments(id,project_id,kind,file_name,display_name,extension,mime_type,size_bytes,type_label,storage_path,status,is_cover,position,metadata) values($1,$2,$3,'cover','Cover','','application/octet-stream',1,'File',$4,'ready',$5,$6,$7)", [attachment, id(31), kind, `${id(11)}/${attachment}`, selected, position, kind === 'document' ? metadata : {}]);
    }
    await setRole('anon');
    const publicBundle = await bundle(11);
    assert.equal(publicBundle.profile.account_id, undefined);
    assert.deepEqual(publicBundle.projects.map(row => row.id), [id(31)]);
    assert.equal(publicBundle.projects[0].page_count, 7);
    assert.equal(publicBundle.projects[0].kind, 'document');
    assert.deepEqual(publicBundle.attachments.map(row => row.id), ['legacy/cover.pdf', 'fallback-image']);
    assert.equal(publicBundle.attachments[0].metadata.privateFutureKey, undefined);
    assert.deepEqual(publicBundle.attachments[0].metadata.renderedPages.map(page => page.withinDocumentIndex), [2]);
    assert.equal(parseSharedProfileBundle(publicBundle, id(11)).projects.length, 1);
    assert.equal(await bundle(12), null);
    await assert.rejects(persist(manifest(), id(99)), /permission denied/);
    await setRole('authenticated', 2); assert.equal(await bundle(12), null, 'Even owners get no private profile from public bundle');
    await assert.rejects(persist(manifest(), id(99)), /not owner/);

    await setRole('authenticated', 1);
    const privateCover = manifest(); await insertVariants(privateCover);
    for (const value of [[], 1, {}, { ...privateCover, variants: {} }, { ...privateCover, bucket: null },
      { ...privateCover, variants: [1, 2, 3] }, { ...privateCover, sourceKey: 'not-a-fingerprint' }]) {
      assert.equal((await db.query('select project_cover_manifest_valid($1,$2,$3) as valid', [value, id(11), id(31)])).rows[0].valid, false);
    }
    const before = await revision(); const next = await persist(privateCover, before); assert.notEqual(next, before);
    await assert.rejects(persist(privateCover, before), /revision conflict/);
    for (const mutate of [
      value => { delete value.bucket; }, value => { value.sourceAttachmentId = 'foreign'; },
      value => { value.variants[0].path = value.variants[0].path.replace(id(11), id(12)); },
      value => { value.variants[0].width = 199; }, value => { value.variants[1].size = 200; },
      value => { value.variants[0].path = value.variants[0].path.replace('a'.repeat(64), 'c'.repeat(64)); },
    ]) { const value = clone(privateCover); mutate(value); await assert.rejects(persist(value), /invalid cover thumbnail manifest|cover source does not belong/); }
    await db.query("insert into storage.objects(bucket_id,name) values('project-media',$1)", [`${id(11)}/${id(31)}/${'c'.repeat(64)}/200.webp`]);
    await setRole('anon');
    assert.equal((await db.query("select name from storage.objects where bucket_id='project-media'")).rows.length, 3, 'Only manifest-referenced private covers can be read');
    await setRole('authenticated', 1);
    await db.query('update profiles set is_private=true where id=$1', [id(11)]);
    await setRole('anon'); assert.equal((await db.query("select name from storage.objects where bucket_id='project-media'")).rows.length, 0);
    await setRole('authenticated', 1); await db.query('update profiles set is_private=false where id=$1', [id(11)]);

    const stable = await revision();
    await db.query("update project_attachments set status='ready',metadata=metadata || '{\"renderedPages\":[],\"processingError\":\"temporary\"}'::jsonb where id='legacy/cover.pdf'");
    assert.equal(await revision(), stable, 'Processing metadata does not invalidate framing');
    await db.query("update project_attachments set metadata=metadata || '{\"coverPageNumber\":3}'::jsonb where id='legacy/cover.pdf'");
    assert.notEqual(await revision(), stable);
    assert.equal((await db.query('select cover_thumbnail from projects where id=$1', [id(31)])).rows[0].cover_thumbnail, null);
    await persist(privateCover);
    await db.query("update project_attachments set is_cover=true,position=-1 where id='fallback-image'");
    assert.equal((await db.query('select cover_thumbnail from projects where id=$1', [id(31)])).rows[0].cover_thumbnail, null, 'New effective cover invalidates baked art');
    await db.query("update project_attachments set is_cover=false,position=1 where id='fallback-image'");
    await persist(privateCover);
    await db.query("update project_attachments set metadata=metadata || '{\"coverFrame\":{\"x\":0.2,\"y\":0.5,\"zoom\":2}}'::jsonb where id='legacy/cover.pdf'");
    assert.equal((await db.query('select cover_thumbnail from projects where id=$1', [id(31)])).rows[0].cover_thumbnail, null);

    const publicCover = manifest('project-covers'); await insertVariants(publicCover); await persist(publicCover);
    for (const query of [
      "update projects set is_hidden=true where id=$1", "delete from projects where id=$1",
    ]) await assert.rejects(db.query(query, [id(31)]), /Remove public cover thumbnails/);
    await assert.rejects(db.query('update projects set category_id=$1 where id=$2', [id(23), id(31)]), /Remove public cover thumbnails/);
    await assert.rejects(db.query('update portfolio_categories set is_hidden=true where id=$1', [id(21)]), /Remove public cover thumbnails/);
    await assert.rejects(db.query('update profiles set is_private=true where id=$1', [id(11)]), /Remove public cover thumbnails/);
    await setRole('anon'); assert.equal((await db.query("select name from storage.objects where bucket_id='project-covers'")).rows.length, 3);
    await setRole('authenticated', 2);
    await assert.rejects(insertVariants(manifest('project-covers', 'd'.repeat(64))), /owned public project/);
    await setRole('service_role'); await persist(publicCover);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('project-covers',$1)", [`${id(12)}/${id(32)}/${'d'.repeat(64)}/200.webp`]), /owned public project/);
    await setRole('authenticated', 1);
    await db.query("delete from storage.objects where bucket_id='project-covers'");
    await persist(null); await db.query('update projects set is_hidden=true where id=$1', [id(31)]);
    await assert.rejects(insertVariants(publicCover), /owned public project/);
    await setRole('service_role'); await assert.rejects(persist(publicCover), /require public content/);
    await setRole('authenticated', 1); await db.query('update projects set is_hidden=false where id=$1', [id(31)]);
    await persist(privateCover); await db.query("delete from project_attachments where id='legacy/cover.pdf'");
    assert.equal((await db.query('select cover_thumbnail from projects where id=$1', [id(31)])).rows[0].cover_thumbnail, null, 'Deleting the source invalidates the manifest atomically');
    await db.query("insert into projects(id,profile_id,category_id,title,summary) values($1,$2,$3,'Empty work','Existing')", [id(35), id(11), id(21)]);
    await setRole('anon');
    assert.equal((await bundle(11)).projects.find(project => project.id === id(35)).kind, null, 'An attachment-free project has no invented media kind');
  } finally { await db.close(); }
});

test('bundle pair needs public Journey and two visible projects; caption absence differs from a cleared caption', () => {
  const value=fixture(); value.profile.show_journey=true;
  value.projects.push({...value.projects[0],id:id(32)});
  value.profile.then_now={then:id(31),now:id(32)};
  let result=parseSharedProfileBundle(value,id(11));assert.equal(result.profile.then_now.now,id(32));
  assert.equal(Object.hasOwn(result.projects[0],'then_now_caption'),false);
  value.projects[0].then_now_caption=null; result=parseSharedProfileBundle(value,id(11));assert.equal(result.projects[0].then_now_caption,null);
  value.profile.show_journey=false;assert.equal(parseSharedProfileBundle(value,id(11)).profile.then_now,null);
  value.profile.show_journey=true;value.projects.pop();assert.equal(parseSharedProfileBundle(value,id(11)).profile.then_now,null);
});

test('bundle citation projection preserves permitted fields and rejects malformed events',()=>{
 const value=fixture();value.citations=[{id:id(50),direction:'incoming',item_id:'stable-page',label:'page 7',other_creator_name:'Creator',other_creator_handle:'creator.work',other_project_id:id(51),other_project_title:'Bridge',other_profile_id:id(52),other_category_id:id(53),citing_project_title:'Bridge',created_at:'2020-03-04T00:00:00Z',note:null,account_id:'private'}];
 const result=parseSharedProfileBundle(value,id(11));assert.equal(result.citations.length,1);assert.equal(result.citations[0].account_id,undefined);
 value.citations[0].created_at='bad';assert.throws(()=>parseSharedProfileBundle(value,id(11)),/invalid/);
});
