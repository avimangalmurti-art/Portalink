// Isolated PostgreSQL only: no Supabase connection, credentials or real data.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH ?? process.env.PGLITE_MODULE;
test('read-path migration skips an absent video pipeline without installing or altering it', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const migration = '202609280001_performance_read_paths.sql';
  const source = name => readFileSync(new URL(name, directory), 'utf8');
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
      grant all on storage.objects to authenticated,service_role; grant select on storage.objects to anon;
      grant select,insert on realtime.messages to authenticated;
      create publication supabase_realtime;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    `);
    for (const name of readdirSync(directory).filter(name => name.endsWith('.sql') && name < migration
      && !['202609100001_video_processing_pipeline.sql','202609140001_video_worker_permissions.sql'].includes(name)).sort()) {
      await db.exec(source(name).replace(/create extension if not exists pgcrypto;/i, ''));
    }
    // Even an independently installed policy must remain untouched when its
    // optional pipeline table is absent; the migration cannot invent access.
    await db.exec('create policy project_media_video_read on storage.objects for select to anon using (false)');
    const tables = (await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','storage') order by 1,2")).rows;
    const buckets = (await db.query('select * from storage.buckets order by id')).rows;
    const videoPolicy = (await db.query("select * from pg_policies where schemaname='storage' and policyname='project_media_video_read'")).rows;
    await db.exec(source(migration));
    await db.exec(source(migration));
    assert.deepEqual((await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','storage') order by 1,2")).rows, tables);
    assert.deepEqual((await db.query('select * from storage.buckets order by id')).rows, buckets);
    assert.deepEqual((await db.query("select * from pg_policies where schemaname='storage' and policyname='project_media_video_read'")).rows, videoPolicy);
    assert.equal((await db.query("select to_regclass('public.video_processing_jobs') as jobs")).rows[0].jobs, null);
    assert.deepEqual((await db.query("select indexname from pg_indexes where schemaname='public' and indexname like 'video_jobs_%'")).rows, []);
    for (const name of ['projects_profile_position_idx','profile_follows_follower_profile_target_status_idx',
      'pdf_jobs_processing_lease_idx','direct_messages_conversation_sender_created_idx']) {
      assert.equal((await db.query('select to_regclass($1) as name', [`public.${name}`])).rows[0].name, name);
    }
    assert.deepEqual((await db.query("select tgname from pg_trigger where tgrelid='public.project_attachments'::regclass and tgname like 'project_attachments_validate_multipart%' order by tgname")).rows.map(row => row.tgname), [
      'project_attachments_validate_multipart_insert','project_attachments_validate_multipart_update',
    ]);
  } finally { await db.close(); }
});

test('performance migrations retain privacy, original validation, atomic arrangements and bounded engagement', { skip: !modulePath }, async t => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const migration = '202609280001_performance_read_paths.sql';
  const source = name => readFileSync(new URL(name, directory), 'utf8');
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const asUser = async n => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']);
    await db.query("select set_config('request.jwt.claim.role',$1,false)", [n ? 'authenticated' : 'anon']);
    await db.exec(`set role ${n ? 'authenticated' : 'anon'}`);
  };
  const visible = async name => (await one('select count(*)::int n from storage.objects where name=$1', [name])).n === 1;
  const object = async (name, bucket = 'project-media', size = 8) => db.query(
    'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3::jsonb)', [bucket, name, JSON.stringify({ size })],
  );
  const attachment = async (name, project, path, size = 8, metadata = {}) => db.query(`
    insert into project_attachments(id,project_id,kind,file_name,display_name,type_label,storage_path,size_bytes,status,metadata)
    values($1,$2,'image','test.png','Test','PNG',$3,$4,'ready',$5::jsonb)`, [name, project, path, size, JSON.stringify(metadata)],
  );
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
      grant all on storage.objects to authenticated,service_role; grant select on storage.objects to anon;
      grant select,insert on realtime.messages to authenticated;
      create publication supabase_realtime;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    `);
    for (const name of readdirSync(directory).filter(name => name.endsWith('.sql') && name < migration).sort()) {
      await db.exec(source(name).replace(/create extension if not exists pgcrypto;/i, ''));
    }
    for (const n of [1, 2, 3, 4]) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `readpath${n}@example.test`]);
      await db.query('insert into profiles(id,account_id,name,handle,is_private) values($1,$2,$3,$4,$5)', [id(n + 10), id(n), `Profile ${n}`, `readpath_${n}`, n === 2]);
    }
    for (const n of [1, 2]) await db.query('insert into portfolio_categories(id,profile_id,label) values($1,$2,$3)', [id(n + 20), id(n + 10), 'Projects']);
    for (const [n, owner, hidden] of [[31, 1, false], [32, 2, false], [33, 1, true]]) {
      await db.query('insert into projects(id,profile_id,category_id,title,summary,is_hidden) values($1,$2,$3,$4,$5,$6)', [id(n), id(owner + 10), id(owner + 20), 'Original', 'Unchanged', hidden]);
      const original = `${id(owner + 10)}/original-${n}.png`;
      await object(original);
      await attachment(`attachment-${n}`, id(n), original);
      const playback = `${id(owner + 10)}/video-previews/${id(n)}/${id(n + 20)}/${id(90)}/playback.mp4.portalink-multipart.json`;
      await db.query("insert into video_processing_jobs(id,project_id,attachment_id,source_path,source_size,status,output_path) values($1,$2,$3,$4,8,'completed',$5)", [id(n + 20), id(n), `attachment-${n}`, original, playback]);
      await object(playback);
      await object(`${playback}.parts/000000`);
      await object(`${playback}.parts/not-a-part`);
      await object(`${playback}.parts/000000/more`);
      await object(`posts/${id(n)}/pages/page_1.webp`);
    }
    await object('posts/not-a-uuid/pages/page_1.webp');
    // Existing chat identity does not confer permission to private projects.
    await db.query("insert into direct_conversations(id,participant_one_profile_id,participant_two_profile_id,status,initiator_profile_id) values($1,$2,$3,'active',$2)", [id(70), id(12), id(13)]);
    await db.query("insert into profile_follows(follower_account_id,follower_profile_id,target_profile_id,status) values($1,$2,$3,'following')", [id(4), id(14), id(12)]);
    const before = (await db.query('select * from projects order by id')).rows;
    const buckets = (await db.query('select * from storage.buckets order by id')).rows;

    await t.test('migration is repeatable and preserves content and private buckets', async () => {
      await db.exec(source(migration));
      await db.exec(source(migration));
      assert.deepEqual((await db.query('select * from projects order by id')).rows, before);
      assert.deepEqual((await db.query('select * from storage.buckets order by id')).rows, buckets);
      assert.equal((await one('select storage_path_uuid($1,2) parsed', [`posts/${id(31)}`])).parsed, null);
      assert.equal((await one('select storage_path_uuid($1,2) parsed', [`posts/${id(31)}/page.webp`])).parsed, id(31));
      for (const name of ['projects_profile_position_idx', 'video_jobs_completed_output_idx', 'profile_follows_follower_profile_target_status_idx',
        'video_jobs_processing_lease_idx', 'pdf_jobs_processing_lease_idx', 'direct_messages_conversation_sender_created_idx']) {
        assert.equal((await one('select to_regclass($1) as name', [`public.${name}`])).name, name);
      }
    });
    const paths = n => [`posts/${id(n)}/pages/page_1.webp`,
      `${id(n === 32 ? 12 : 11)}/video-previews/${id(n)}/${id(n + 20)}/${id(90)}/playback.mp4.portalink-multipart.json`];
    await t.test('anonymous readers see public previews and canonical video parts, not malformed, hidden or private paths', async () => {
      await asUser(null);
      for (const path of paths(31)) assert.equal(await visible(path), true, path);
      const video = paths(31)[1];
      assert.equal(await visible(`${video}.parts/000000`), true);
      assert.equal(await visible(`${video}.parts/not-a-part`), false);
      assert.equal(await visible(`${video}.parts/000000/more`), false);
      assert.equal(await visible('posts/not-a-uuid/pages/page_1.webp'), false);
      for (const path of [...paths(32), ...paths(33)]) assert.equal(await visible(path), false, path);
    });
    await t.test('owners and accepted followers retain private access; chat-only identity does not', async () => {
      for (const user of [2, 4]) {
        await asUser(user);
        for (const path of paths(32)) assert.equal(await visible(path), true, path);
      }
      await asUser(3);
      assert.equal((await one('select can_view_profile_identity($1) ok', [id(12)])).ok, true);
      for (const path of paths(32)) assert.equal(await visible(path), false, path);
      await asUser(1);
      for (const path of paths(33)) assert.equal(await visible(path), true, path);
    });
    await t.test('message uploads still require owned paths, active membership and no block; malformed UUIDs fail closed', async () => {
      await asUser(3);
      await object(`${id(13)}/${id(70)}/allowed.png`, 'message-media');
      for (const path of [`${id(12)}/${id(70)}/spoofed.png`, `not-uuid/${id(70)}/bad.png`, `${id(13)}/bad-uuid/bad.png`, `${id(13)}/${id(71)}/unknown.png`, `${id(13)}/${id(70)}`]) {
        await assert.rejects(object(path, 'message-media'), /row-level security/);
      }
      await db.exec('reset role');
      await db.query("update direct_conversations set status='request' where id=$1", [id(70)]);
      await asUser(3);
      await assert.rejects(object(`${id(13)}/${id(70)}/pending.png`, 'message-media'), /row-level security/);
      await db.exec('reset role');
      await db.query("update direct_conversations set status='active' where id=$1", [id(70)]);
      await db.query('insert into direct_message_blocks(blocker_profile_id,blocked_profile_id) values($1,$2)', [id(12), id(13)]);
      await asUser(3);
      await assert.rejects(object(`${id(13)}/${id(70)}/blocked.png`, 'message-media'), /row-level security/);
    });
    await t.test('unrelated metadata skips original part scans; changes and inserts still enforce completeness', async () => {
      await db.exec('reset role');
      const path = `${id(11)}/large.portalink-multipart.json`;
      const spec = { version: 1, sizeBytes: 8, partBytes: 41943040, partCount: 1 };
      await object(`${path}.parts/000000`);
      await attachment('multipart', id(31), path, 8, { multipart: spec });
      await db.query('delete from storage.objects where name=$1', [`${path}.parts/000000`]);
      await db.query("update project_attachments set metadata=metadata || '{\"coverFrame\":{\"x\":0.5}}'::jsonb where id='multipart'");
      // Same spec is no new original upload and must not scan missing parts.
      await db.query("update project_attachments set metadata=metadata where id='multipart'");
      await assert.rejects(db.query("update project_attachments set size_bytes=9,metadata=jsonb_set(metadata,'{multipart,sizeBytes}','9') where id='multipart'"), /incomplete/);
      await assert.rejects(db.query("update project_attachments set metadata=metadata-'multipart' where id='multipart'"), /metadata is required/);
      await assert.rejects(attachment('missing', id(31), `${id(11)}/missing.portalink-multipart.json`, 8, { multipart: spec }), /incomplete/);
      const unchanged = await one("select size_bytes,metadata from project_attachments where id='multipart'");
      assert.equal(unchanged.size_bytes, 8);
      assert.deepEqual(unchanged.metadata.multipart, spec);
      assert.deepEqual(unchanged.metadata.coverFrame, { x: 0.5 });
    });

    await db.exec('reset role');
    await db.exec(source('202609280003_atomic_arrangement_engagement.sql'));
    await db.exec(source('202609280003_atomic_arrangement_engagement.sql'));
    await db.query('insert into portfolio_categories(id,profile_id,label) values($1,$2,$3)', [id(23), id(11), 'Second portal']);
    for (const n of [34, 35]) await db.query('insert into projects(id,profile_id,category_id,title,summary) values($1,$2,$3,$4,$5)', [id(n), id(11), id(23), `Project ${n}`, '']);
    await db.query('update profiles set project_grid_columns=5 where id=$1', [id(11)]);
    await db.query("update projects set position=0,published_at='2026-01-01'::timestamptz + (right(id::text,2)::integer * interval '1 day') where profile_id=$1", [id(11)]);
    const arrangementRows = async () => (await db.query('select id,category_id,position,is_hidden,is_pinned from projects where profile_id=$1 order by position,id', [id(11)])).rows;
    const order = async () => (await arrangementRows()).map(row => row.id);
    const wall = ids => db.query('select save_profile_project_order($1,$2::uuid[])', [id(11), ids.map(id)]);
    const arrange = (ids, hidden = [], pinned = []) => db.query('select save_project_arrangement($1,$2,$3::uuid[],$4::uuid[],$5::uuid[])', [id(11), id(21), ids.map(id), hidden.map(id), pinned.map(id)]);
    await t.test('profile order appends omitted work and retains negative positions, visibility and grid density', async () => {
      await asUser(1);
      const previous = await arrangementRows();
      await wall([35, 31]);
      assert.deepEqual(await order(), [35, 31, 34, 33].map(id));
      assert.deepEqual((await arrangementRows()).map(row => row.position), [-4, -3, -2, -1]);
      for (const row of await arrangementRows()) {
        const original = previous.find(item => item.id === row.id);
        assert.equal(row.is_hidden, original.is_hidden);
        assert.equal(row.is_pinned, original.is_pinned);
      }
      assert.equal((await one('select project_grid_columns from profiles where id=$1', [id(11)])).project_grid_columns, 5);
      const saved = await arrangementRows();
      for (const ids of [[31, 31], [31, 32], [999]]) await assert.rejects(wall(ids), /distinct|does not own/);
      assert.deepEqual(await arrangementRows(), saved);
    });
    await t.test('category arrangement replaces its wall slots without moving other portals or resetting density', async () => {
      await arrange([33, 31], [31], [33]);
      assert.deepEqual(await order(), [35, 33, 34, 31].map(id));
      const rows = await arrangementRows();
      assert.equal(rows.find(row => row.id === id(31)).is_hidden, true);
      assert.equal(rows.find(row => row.id === id(33)).is_hidden, false);
      assert.equal(rows.find(row => row.id === id(33)).is_pinned, true);
      assert.equal(rows.find(row => row.id === id(34)).is_hidden, false);
      await assert.rejects(arrange([31]), /category does not hold/);
      await assert.rejects(arrange([31, 33], [34]), /category does not hold/);
      assert.deepEqual(await arrangementRows(), rows);
      assert.equal((await one('select project_grid_columns from profiles where id=$1', [id(11)])).project_grid_columns, 5);
    });
    await t.test('failure mid-arrangement rolls back every update, and outsiders cannot arrange even visible profiles', async () => {
      const rows = await arrangementRows();
      await db.exec(`reset role;
        create function public.test_reorder_failure() returns trigger language plpgsql as $$begin if new.id='${id(31)}' then raise exception 'test mid-write failure'; end if; return new; end$$;
        create trigger test_reorder_failure before update on projects for each row execute function public.test_reorder_failure();`);
      await asUser(1);
      await assert.rejects(wall([31, 34, 33, 35]), /test mid-write failure/);
      assert.deepEqual(await arrangementRows(), rows);
      await db.exec('reset role; drop trigger test_reorder_failure on projects; drop function public.test_reorder_failure()');
      await asUser(3);
      await assert.rejects(wall([31]), /Only the profile owner/);
      await assert.rejects(arrange([31, 33]), /Only the profile owner/);
      await assert.rejects(db.query('select save_portfolio_arrangement($1,$2::uuid[],$3::uuid[],$4::jsonb)', [id(11), [id(21)], [], '{}']), /Only the profile owner/);
      await asUser(null);
      await assert.rejects(wall([31]), /permission denied/);
      await asUser(1);
      assert.deepEqual(await arrangementRows(), rows);
    });
    await t.test('category wall slots accept valid arrays with non-default lower bounds', async () => {
      await asUser(1);
      await db.query('select save_project_arrangement($1,$2,$3::uuid[],$4::uuid[],$5::uuid[])',
        [id(11), id(21), `[0:1]={${id(31)},${id(33)}}`, [], []]);
      assert.deepEqual(await order(), [35,31,34,33].map(id));
      await db.query('select save_project_arrangement($1,$2,$3::uuid[],$4::uuid[],$5::uuid[])',
        [id(11), id(21), `[-2:-1]={${id(33)},${id(31)}}`, [], []]);
      assert.deepEqual(await order(), [35,33,34,31].map(id));
      assert.deepEqual((await arrangementRows()).map(row => row.position), [-4,-3,-2,-1]);
      assert.equal((await one('select project_grid_columns from profiles where id=$1', [id(11)])).project_grid_columns, 5);
    });
    await t.test('legacy per-category positions and atomic portal properties remain supported', async () => {
      await db.exec('reset role');
      await db.query('update projects set position=10 where profile_id=$1', [id(11)]);
      await asUser(1);
      await arrange([31, 33], [], [31]);
      const rows = await arrangementRows();
      assert.equal(rows.find(row => row.id === id(31)).position, 0);
      assert.equal(rows.find(row => row.id === id(33)).position, 1);
      assert.equal(rows.find(row => row.id === id(34)).position, 10);
      await db.query('select save_portfolio_arrangement($1,$2::uuid[],$3::uuid[],$4::jsonb)', [id(11), [id(23), id(21)], [id(23)], JSON.stringify({ [id(23)]: 'CameraIcon' })]);
      const portals = (await db.query('select id,position,is_hidden,icon_name from portfolio_categories where profile_id=$1 order by position', [id(11)])).rows;
      assert.deepEqual(portals.filter(portal => [id(21), id(23)].includes(portal.id)), [
        { id: id(23), position: 0, is_hidden: true, icon_name: 'CameraIcon' },
        { id: id(21), position: 1, is_hidden: false, icon_name: 'FolderIcon' },
      ]);
      await assert.rejects(db.query('select save_portfolio_arrangement($1,$2::uuid[],$3::uuid[],$4::jsonb)', [id(11), [id(21), id(22)], [], '{}']), /does not own/);
      assert.deepEqual((await db.query('select id,position,is_hidden,icon_name from portfolio_categories where profile_id=$1 order by position', [id(11)])).rows, portals);
      assert.equal((await one('select project_grid_columns from profiles where id=$1', [id(11)])).project_grid_columns, 5);
    });
    await t.test('batched engagement counts are accurate, viewer-specific, permission-scoped and bounded', async () => {
      await db.exec('reset role');
      for (const [account, project, kind] of [[1,31,'like'], [3,31,'like'], [3,31,'save'], [2,32,'repost'], [4,32,'like']]) {
        await db.query('insert into project_engagement(account_id,project_id,kind) values($1,$2,$3)', [id(account), id(project), kind]);
      }
      await db.query("insert into project_comments(id,project_id,author_profile_id,body) values($1,$2,$3,'Public comment'),($4,$5,$6,'Private comment')", [id(81),id(31),id(11),id(82),id(32),id(12)]);
      const summaries = async (projects = [31,32,999]) => (await db.query('select * from project_engagement_summaries($1::uuid[]) order by project_id', [projects.map(id)])).rows;
      await asUser(3);
      assert.deepEqual(await summaries([31,31,32,999]), [{ project_id:id(31), like_count:2, save_count:1, repost_count:0, comment_count:1, viewer_liked:true, viewer_saved:true, viewer_reposted:false }]);
      await asUser(null);
      assert.deepEqual(await summaries(), [{ project_id:id(31), like_count:2, save_count:1, repost_count:0, comment_count:1, viewer_liked:false, viewer_saved:false, viewer_reposted:false }]);
      await asUser(4);
      const follower = (await summaries()).find(row => row.project_id === id(32));
      assert.equal(follower.like_count, 1);
      assert.equal(follower.repost_count, 1);
      assert.equal(follower.comment_count, 1);
      assert.equal(follower.viewer_liked, true);
      // Hidden portals suppress aggregates just as direct project/feed reads do,
      // including an accepted follower of a private profile. Owners still see them.
      await asUser(null);
      assert.deepEqual(await summaries([34,35]), []);
      await asUser(1);
      assert.deepEqual((await summaries([34,35])).map(row => row.project_id), [id(34),id(35)]);
      await db.exec('reset role');
      await db.query('update portfolio_categories set is_hidden=true where id=$1', [id(22)]);
      await asUser(4);
      assert.deepEqual(await summaries([32]), []);
      await asUser(2);
      assert.equal((await summaries([32]))[0].repost_count, 1);
      await db.exec('reset role');
      await db.query('update portfolio_categories set is_hidden=false where id=$1', [id(22)]);
      await db.query('update projects set is_hidden=true where id=$1', [id(32)]);
      await asUser(4);
      assert.equal((await summaries()).length, 1);
      await asUser(2);
      assert.equal((await summaries()).find(row => row.project_id === id(32)).viewer_reposted, true);
      assert.deepEqual(await summaries([]), []);
      await assert.rejects(db.query('select * from project_engagement_summaries(array_fill($1::uuid,array[201]))', [id(31)]), /at most 200/);
    });

    // Supabase Realtime's network sender is replaced with a local event ledger.
    // The trigger, payload, policies and real messaging mutations stay intact.
    await db.exec(`reset role;
      create table realtime.test_sent_events(sequence bigserial primary key,payload jsonb,event text,topic text,private boolean);
      create function realtime.send(payload jsonb,event text,topic text,private boolean default true)
      returns void language sql as $$insert into realtime.test_sent_events(payload,event,topic,private) values($1,$2,$3,$4)$$;
      revoke all on function realtime.send(jsonb,text,text,boolean) from public,anon,authenticated;
    `);
    await db.exec(source('202609280004_scoped_message_activity.sql'));
    await db.exec(source('202609280004_scoped_message_activity.sql'));
    await db.query("insert into direct_conversations(id,participant_one_profile_id,participant_two_profile_id,status,initiator_profile_id,established_at) values($1,$2,$3,'active',$2,now())", [id(71),id(11),id(14)]);
    await t.test('scoped activity migration is idempotent and browser roles cannot invoke the trigger sender', async () => {
      assert.equal((await one("select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and tablename='direct_conversation_states'")).n, 1);
      for (const role of ['anon', 'authenticated']) assert.equal((await one("select has_function_privilege($1,'public.broadcast_direct_activity()','EXECUTE') ok", [role])).ok, false);
      await asUser(1);
      assert.equal((await one('select messaging_realtime_version() version')).version, 1);
      await asUser(null);
      await assert.rejects(db.query('select messaging_realtime_version()'), /permission denied/);
    });
    await t.test('message and reaction insert/update/delete emit only private conversation-scoped IDs', async () => {
      await asUser(1);
      const message = await one("select * from send_direct_message($1,'Secret message body')", [id(71)]);
      await db.query("update direct_messages set body='Secret edited body' where id=$1", [message.id]);
      await db.query("insert into direct_message_reactions(message_id,profile_id,emoji) values($1,$2,'❤')", [message.id,id(11)]);
      await db.query('delete from direct_message_reactions where message_id=$1', [message.id]);
      await db.query("insert into direct_message_reactions(message_id,profile_id,emoji) values($1,$2,'❤')", [message.id,id(11)]);
      // Its cascaded reaction deletion sees no parent row. The message DELETE
      // itself must still emit the invalidation, without inventing a channel.
      await db.query('delete from direct_messages where id=$1', [message.id]);
      await db.exec('reset role');
      const events = (await db.query('select payload,event,topic,private from realtime.test_sent_events order by sequence')).rows;
      assert.deepEqual(events.map(row => [row.payload.table,row.payload.operation]), [
        ['direct_messages','INSERT'], ['direct_messages','UPDATE'], ['direct_message_reactions','INSERT'],
        ['direct_message_reactions','DELETE'], ['direct_message_reactions','INSERT'], ['direct_messages','DELETE'],
      ]);
      for (const row of events) {
        assert.equal(row.event, 'changed');
        assert.equal(row.topic, `direct-activity:${id(71)}`);
        assert.equal(row.private, true);
        assert.equal(row.payload.conversationId, id(71));
        assert.equal(row.payload.messageId, message.id);
        assert.deepEqual(Object.keys(row.payload).sort(), ['conversationId','messageId','operation','table']);
      }
    });
    await t.test('activity topic is participant-readable and has no browser send policy; existing typing still works', async () => {
      await db.exec('reset role');
      await db.query("insert into realtime.messages(extension) values('broadcast'),('presence')");
      for (const user of [1,4]) {
        await asUser(user);
        await db.query("select set_config('realtime.topic',$1,false)", [`direct-activity:${id(71)}`]);
        assert.equal((await one('select count(*)::int n from realtime.messages')).n, 1);
        await assert.rejects(db.query("insert into realtime.messages(extension) values('broadcast')"), /row-level security/);
      }
      await asUser(3);
      assert.equal((await one('select count(*)::int n from realtime.messages')).n, 0);
      await assert.rejects(db.query("insert into realtime.messages(extension) values('broadcast')"), /row-level security/);
      await asUser(1);
      for (const topic of [`direct-activity:${id(71)}/extra`, `direct-activity:${id(999)}`, 'direct-activity:not-a-uuid']) {
        await db.query("select set_config('realtime.topic',$1,false)", [topic]);
        assert.equal((await one('select count(*)::int n from realtime.messages')).n, 0);
      }
      await db.query("select set_config('realtime.topic',$1,false)", [`direct-typing:${id(71)}`]);
      await db.query("insert into realtime.messages(extension) values('broadcast')");
      assert.equal((await one('select count(*)::int n from realtime.messages')).n, 2);
    });

    await db.exec('reset role');
    await db.query('insert into auth.users(id,email) values($1,$2)', [id(5), 'no-profile@example.test']);
    await db.query("insert into direct_conversations(id,participant_one_profile_id,participant_two_profile_id,status,initiator_profile_id) values($1,$2,$3,'request',$2)", [id(72),id(11),id(12)]);
    for (const [message, conversation, sender, hour] of [[91,71,11,0],[92,71,14,1],[93,71,11,2],[94,72,11,3],[95,70,12,4]]) {
      await db.query("insert into direct_messages(id,conversation_id,sender_profile_id,body,created_at) values($1,$2,$3,'History fixture','2026-09-01T00:00:00Z'::timestamptz + $4::integer * interval '1 hour')", [id(message),id(conversation),id(sender),hour]);
    }
    for (const [conversation, participants] of [[70,[12,13]],[71,[11,14]],[72,[11,12]]]) {
      for (const profile of participants) {
        await db.query('insert into direct_conversation_reads(conversation_id,profile_id) values($1,$2) on conflict do nothing', [id(conversation),id(profile)]);
        await db.query('insert into direct_conversation_states(conversation_id,profile_id) values($1,$2) on conflict do nothing', [id(conversation),id(profile)]);
      }
    }
    for (const profile of [11,12,13,14]) await db.query('insert into messaging_preferences(profile_id) values($1) on conflict do nothing', [id(profile)]);
    for (const [message, profile] of [[91,11],[94,11],[95,12]]) await db.query("insert into direct_message_reactions(message_id,profile_id,emoji) values($1,$2,'❤')", [id(message),id(profile)]);
    await db.query("insert into direct_message_reports(id,reporter_profile_id,conversation_id,reason) values($1,$2,$3,'Fixture reason')", [id(101),id(11),id(71)]);
    await db.query("insert into direct_message_attachments(id,message_id,file_name,mime_type,size_bytes,storage_path) values($1,$2,'fixture.png','image/png',8,$3)", [id(102),id(91),`${id(11)}/${id(71)}/attachment.png`]);
    const messagingSnapshot = async user => {
      await asUser(user);
      const tables = ['direct_conversations','direct_messages','direct_message_reactions','direct_conversation_reads',
        'direct_conversation_states','direct_message_blocks','direct_message_reports','messaging_preferences','direct_message_attachments'];
      const result = {};
      for (const table of tables) result[table] = (await db.query(`select to_jsonb(record) value from public.${table} record order by to_jsonb(record)::text`)).rows;
      result.summaries = (await db.query('select * from direct_conversation_message_summaries($1::uuid[]) order by conversation_id', [[id(70),id(71),id(72)]])).rows;
      return result;
    };
    const writeCases = [
      [1, 'update direct_messages set body=body where id=$1 returning id', [id(91)]],
      [4, 'update direct_messages set body=body where id=$1 returning id', [id(91)]],
      [2, 'update direct_messages set body=body where id=$1 returning id', [id(95)]],
      [1, 'update direct_messages set body=body where id=$1 returning id', [id(94)]],
      [1, "insert into direct_message_reactions(message_id,profile_id,emoji) values($1,$2,'✨') returning message_id", [id(91),id(11)]],
      [1, "insert into direct_message_reactions(message_id,profile_id,emoji) values($1,$2,'✨') returning message_id", [id(94),id(11)]],
      [2, "insert into direct_message_reactions(message_id,profile_id,emoji) values($1,$2,'✨') returning message_id", [id(95),id(12)]],
      [1, "insert into direct_message_reactions(message_id,profile_id,emoji) values($1,$2,'✨') returning message_id", [id(91),id(14)]],
      [2, 'delete from direct_message_reactions where message_id=$1 and profile_id=$2 returning message_id', [id(95),id(12)]],
      [1, 'update direct_conversation_states set is_muted=true where conversation_id=$1 and profile_id=$2 returning profile_id', [id(71),id(11)]],
      [4, 'update direct_conversation_states set is_muted=true where conversation_id=$1 and profile_id=$2 returning profile_id', [id(71),id(11)]],
      [1, "insert into direct_message_reports(reporter_profile_id,conversation_id,reason) values($1,$2,'Fixture') returning id", [id(11),id(71)]],
      [1, "insert into direct_message_reports(reporter_profile_id,conversation_id,reason) values($1,$2,'Fixture') returning id", [id(11),id(70)]],
      [1, "insert into direct_message_reports(reporter_profile_id,conversation_id,reason) values($1,$2,'Fixture') returning id", [id(14),id(71)]],
      [1, "update messaging_preferences set permission='followers' where profile_id=$1 returning profile_id", [id(11)]],
      [1, "update messaging_preferences set permission='followers' where profile_id=$1 returning profile_id", [id(14)]],
      [1, 'insert into direct_message_blocks(blocker_profile_id,blocked_profile_id) values($1,$2) returning blocker_profile_id', [id(11),id(14)]],
      [1, 'insert into direct_message_blocks(blocker_profile_id,blocked_profile_id) values($1,$2) returning blocker_profile_id', [id(14),id(11)]],
      [1, 'update direct_conversation_reads set last_read_at=now() where conversation_id=$1 and profile_id=$2 returning profile_id', [id(71),id(11)]],
      [1, "insert into direct_messages(conversation_id,sender_profile_id,body) values($1,$2,'Bypass attempt') returning id", [id(71),id(11)]],
      [5, 'update messaging_preferences set permission=permission where profile_id=$1 returning profile_id', [id(11)]],
    ];
    const writeOutcomes = async () => {
      const outcomes = [];
      for (const [user, sql, params] of writeCases) {
        await asUser(user);
        await db.exec('begin');
        try { outcomes.push({ rows: (await db.query(sql,params)).rows.length }); }
        catch (error) { outcomes.push({ code: error.code }); }
        finally { await db.exec('rollback'); }
      }
      return outcomes;
    };
    const priorMessaging = new Map();
    for (const user of [1,2,3,4,5]) priorMessaging.set(user, await messagingSnapshot(user));
    const priorWrites = await writeOutcomes();
    await db.exec('reset role');
    await db.exec(source('202609280006_messaging_read_identity.sql'));
    await db.exec(source('202609280006_messaging_read_identity.sql'));
    await t.test('messaging identity optimization preserves active, pending, blocked, outsider and no-profile reads exactly', async () => {
      for (const user of [1,2,3,4,5]) {
        assert.deepEqual(await messagingSnapshot(user), priorMessaging.get(user), `viewer ${user}`);
        assert.equal((await one('select current_profile_id() id')).id, user === 5 ? null : id(user + 10));
      }
      await asUser(1);
      const summaries = (await messagingSnapshot(1)).summaries;
      const active = summaries.find(row => row.conversation_id === id(71));
      assert.equal(active.last_message.id, id(93));
      assert.equal(new Date(active.last_incoming_at).toISOString(), '2026-09-01T01:00:00.000Z');
      const request = summaries.find(row => row.conversation_id === id(72));
      assert.equal(request.last_incoming_at, null);
      assert.equal(priorMessaging.get(5).direct_conversations.length, 0);
      assert.equal(priorMessaging.get(5).direct_messages.length, 0);
      await asUser(null);
      await assert.rejects(db.query('select current_profile_id()'), /permission denied/);
    });
    await t.test('messaging ownership optimization preserves all write gates and existing revoked privileges', async () => {
      assert.deepEqual(await writeOutcomes(), priorWrites);
      // Explicitly require meaningful allowed, row-filtered and denied cases;
      // equivalence must not accidentally mean all test writes failed.
      assert.deepEqual(priorWrites, [
        { rows:1 }, { rows:0 }, { rows:0 }, { rows:1 },
        { rows:1 }, { code:'42501' }, { code:'42501' }, { code:'42501' }, { rows:1 },
        { rows:1 }, { rows:0 }, { rows:1 }, { code:'42501' }, { code:'42501' },
        { rows:1 }, { rows:0 }, { rows:1 }, { code:'42501' }, { code:'42501' }, { code:'42501' }, { rows:0 },
      ]);
    });
    await t.test('conversation and message reads evaluate identity per statement, not per message row', async () => {
      await db.exec(`reset role;
        create sequence public.test_identity_calls;
        create or replace function public.current_profile_id() returns uuid language plpgsql stable security definer set search_path='' as $$
        begin
          perform nextval('public.test_identity_calls');
          return (select p.id from public.profiles p where p.account_id=(select auth.uid()));
        end; $$;
      `);
      for (const table of ['direct_conversations','direct_messages']) {
        await db.exec('reset role; alter sequence public.test_identity_calls restart with 1');
        await asUser(1);
        await db.query(`select * from ${table}`);
        await db.exec('reset role');
        const calls = (await one('select case when is_called then last_value else 0 end calls from public.test_identity_calls')).calls;
        assert.ok(calls > 0 && calls <= 2, `${table}: expected at most two scalar predicate lookups, got ${calls}`);
      }
      await db.exec(source('202609280006_messaging_read_identity.sql'));
      await db.exec('drop sequence public.test_identity_calls');
    });
  } finally { await db.close(); }
});
