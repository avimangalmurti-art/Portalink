import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE;
test('video pipeline migration: backfill, visibility, token fencing, output integrity and owner retries', { skip: !modulePath }, async t => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const privateOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const project = '11111111-1111-4111-8111-111111111111';
  const privateProject = '22222222-2222-4222-8222-222222222222';
  const source = `${owner}/original.mov`;
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const workerFunctions = [
    'public.claim_video_processing_job(integer)',
    'public.heartbeat_video_processing(uuid,uuid)',
    'public.complete_video_processing(uuid,uuid,text,integer,integer,double precision,bigint,jsonb)',
    'public.fail_video_processing(uuid,uuid,text,boolean)',
  ];
  const restrictedFunctions = [...workerFunctions, 'public.enqueue_video_attachment()'];
  const retryFunction = 'public.retry_video_processing(text)';
  const canExecute = async (role, signature) => (await one(
    "select has_function_privilege($1, $2, 'EXECUTE') allowed", [role, signature],
  )).allowed;
  const verifyWorkerPermissions = async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const signature of restrictedFunctions) {
        assert.equal(await canExecute(role, signature), false, `${role} must not execute ${signature}`);
      }
      assert.equal(await canExecute(role, retryFunction), role === 'authenticated');
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(db.query('select * from claim_video_processing_job()'), /permission denied/);
      } finally { await db.exec('reset role'); }
    }
    for (const signature of workerFunctions) {
      assert.equal(await canExecute('service_role', signature), true, `service_role must execute ${signature}`);
    }
    // Prove the worker can still claim real queued work without consuming a fixture.
    await db.exec('begin; set local role service_role');
    try {
      const claimed = await one('select * from claim_video_processing_job()');
      assert.equal(claimed.status, 'processing');
      assert.ok(claimed.lease_token);
    } finally { await db.exec('rollback'); }
  };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema storage;
      grant usage on schema public, storage to anon, authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
      create function public.owns_profile(id uuid) returns boolean language sql stable as $$ select id::text = current_setting('test.owner', true) $$;
      create function public.can_view_profile(id uuid) returns boolean language sql stable as $$ select id <> '${privateOwner}'::uuid or public.owns_profile(id) $$;
      create function public.path_profile_id(path text) returns uuid language sql immutable as $$ select split_part(path, '/', 1)::uuid $$;
      create table public.projects(id uuid primary key, profile_id uuid not null, is_hidden boolean default false, title text, summary text, revision uuid default gen_random_uuid());
      create table public.project_attachments(id text primary key, project_id uuid references public.projects on delete cascade, storage_path text, size_bytes bigint, mime_type text, extension text, file_name text, display_name text, kind text, status text, type_label text, is_cover boolean, position integer, metadata jsonb);
      create table storage.objects(bucket_id text, name text, metadata jsonb, primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      create policy original_owner on storage.objects for select to authenticated using(public.owns_profile(public.path_profile_id(name)));
      grant select on public.projects, public.project_attachments, storage.objects to anon, authenticated;
      grant update, insert, delete on public.projects, public.project_attachments to authenticated;
      insert into public.projects(id,profile_id) values('${project}','${owner}'),('${privateProject}','${privateOwner}');
      insert into storage.objects values('project-media','${source}','{"size":8}'),('project-media','${privateOwner}/private.mov','{"size":8}');
      insert into public.project_attachments(id,project_id,storage_path,size_bytes,mime_type,extension,file_name,kind,status,metadata)
      values('legacy','${project}','${source}',8,'video/quicktime','mov','original.mov','unknown','conversion-required','{}'),
      ('private','${privateProject}','${privateOwner}/private.mov',8,'video/quicktime','mov','private.mov','unknown','conversion-required','{}');
    `);
    await db.exec(await fs.readFile(new URL('../supabase/migrations/202609100001_video_processing_pipeline.sql', import.meta.url), 'utf8'));
    await t.test('existing unsupported uploads enter queue without modifying originals', async () => {
      assert.equal((await one('select count(*)::int n from video_processing_jobs')).n, 2);
      const row = await one("select kind,status,storage_path from project_attachments where id='legacy'");
      assert.deepEqual(row, { kind: 'video', status: 'processing', storage_path: source });
    });
    await t.test('fresh installs revoke default browser grants while retaining worker and owner-retry access', verifyWorkerPermissions);
    await t.test('forward migration repairs direct browser grants on already-installed functions', async () => {
      const signatures = [...restrictedFunctions, retryFunction];
      await db.exec(`grant execute on function ${signatures.join(', ')} to anon, authenticated`);
      for (const role of ['anon', 'authenticated']) {
        for (const signature of signatures) assert.equal(await canExecute(role, signature), true);
      }
      await db.exec(await fs.readFile(new URL('../supabase/migrations/202609140001_video_worker_permissions.sql', import.meta.url), 'utf8'));
      await verifyWorkerPermissions();
    });
    await t.test('anonymous viewers see only public job status and cannot claim work', async () => {
      await db.exec('set role anon');
      assert.deepEqual((await db.query('select attachment_id from video_processing_jobs')).rows.map(r => r.attachment_id), ['legacy']);
      await assert.rejects(db.query('select * from claim_video_processing_job()'), /permission denied/);
      await db.exec('reset role');
    });
    // Put the private job later so claims are deterministic.
    await db.exec("update video_processing_jobs set available_at=now()+interval '1 hour' where attachment_id='private'");
    let job = await one('select * from claim_video_processing_job()');
    const originalToken = job.lease_token;
    await t.test('expired attempts receive fresh tokens and stale completion/failure are refused', async () => {
      await db.query("update video_processing_jobs set lease_expires_at=now()-interval '1 second' where id=$1", [job.id]);
      job = await one('select * from claim_video_processing_job()');
      assert.notEqual(job.lease_token, originalToken);
      assert.equal((await one('select heartbeat_video_processing($1,$2) ok', [job.id, originalToken])).ok, false);
      assert.equal((await one("select fail_video_processing($1,$2,'stale',true) ok", [job.id, originalToken])).ok, false);
      assert.equal((await one("select complete_video_processing($1,$2,'bogus',160,120,1,8) ok", [job.id, originalToken])).ok, false);
    });
    let output = `${owner}/video-previews/${project}/${job.id}/${job.lease_token}/playback.mp4`;
    await t.test('single output size must match and only committed output becomes public', async () => {
      await db.query("insert into storage.objects values('project-media',$1,'{\"size\":7}')", [output]);
      await assert.rejects(db.query('select complete_video_processing($1,$2,$3,160,120,1,8)', [job.id,job.lease_token,output]), /Incomplete video/);
      await db.exec('set role anon');
      assert.equal((await one('select count(*)::int n from storage.objects')).n, 0);
      await db.exec('reset role');
      await db.query("update storage.objects set metadata='{\"size\":8}' where name=$1", [output]);
      assert.equal((await one('select complete_video_processing($1,$2,$3,160,120,1,8) ok', [job.id,job.lease_token,output])).ok, true);
      assert.equal((await one('select complete_video_processing($1,$2,$3,160,120,1,8) ok', [job.id,job.lease_token,output])).ok, true);
      await db.exec('set role anon');
      assert.equal((await one('select count(*)::int n from storage.objects')).n, 1);
      await db.exec('reset role');
      assert.equal((await one("select storage_path from project_attachments where id='legacy'")).storage_path, source);
    });
    await t.test('replacing source invalidates old playback and fences the completed attempt', async () => {
      await db.query("update project_attachments set storage_path=$1, size_bytes=10 where id='legacy'", [`${owner}/replacement.mov`]);
      const row = await one("select metadata from project_attachments where id='legacy'");
      assert.equal(row.metadata.playbackVideo, undefined);
      assert.equal((await one('select complete_video_processing($1,$2,$3,160,120,1,8) ok', [job.id,job.lease_token,output])).ok, false);
      job = await one('select * from claim_video_processing_job()');
    });
    await t.test('multipart completion rejects a missing or short part', async () => {
      output = `${owner}/video-previews/${project}/${job.id}/${job.lease_token}/playback.mp4.portalink-multipart.json`;
      const spec = { version:1, sizeBytes:41943043, partBytes:41943040, partCount:2 };
      await db.query("insert into storage.objects values('project-media',$1,'{\"size\":100}'),('project-media',$2,'{\"size\":41943040}')", [output,output+'.parts/000000']);
      const args = [job.id,job.lease_token,output,JSON.stringify(spec)];
      const sql = 'select complete_video_processing($1,$2,$3,160,120,1,41943043,$4::jsonb) ok';
      await assert.rejects(db.query(sql,args), /Incomplete video/);
      await db.query("insert into storage.objects values('project-media',$1,'{\"size\":2}')", [output+'.parts/000001']);
      await assert.rejects(db.query(sql,args), /Incomplete video/);
      await db.query("update storage.objects set metadata='{\"size\":3}' where name=$1", [output+'.parts/000001']);
      assert.equal((await one(sql,args)).ok,true);
    });
    await t.test('only the owner can restart a failed conversion', async () => {
      await db.exec("update video_processing_jobs set status='failed',is_retryable=true where attachment_id='legacy'; set role authenticated");
      await db.query("select set_config('test.owner',$1,false)",[privateOwner]);
      await assert.rejects(db.query("select retry_video_processing('legacy')"), /permission denied/);
      await db.query("select set_config('test.owner',$1,false)",[owner]);
      assert.equal((await one("select retry_video_processing('legacy') result")).result.state,'processing');
      await db.exec('reset role');
    });
    await t.test('project edit cleanup includes its committed derived copy', async () => {
      await db.query("update video_processing_jobs set status='completed', output_path=$1 where attachment_id='legacy'", [output]);
      await db.query("insert into project_attachments(id,project_id,storage_path,size_bytes,mime_type,extension,file_name,kind,status) values('keep',$1,$2,1,'image/png','png','keep.png','image','ready')",[project,`${owner}/keep.png`]);
      await db.query("select set_config('test.owner',$1,false)",[owner]);
      const result=await one("select update_project($1,$2,'Test','', '[{\"id\":\"keep\"}]','[]') result",[project,owner]);
      assert.ok(result.result.removedStoragePaths.includes(output));
      assert.equal((await one("select count(*)::int n from storage.objects where name=$1",[source])).n,1);
    });
  } finally { await db.close(); }
});
