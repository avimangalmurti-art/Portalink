// Isolated PostgreSQL checks; never connects to Supabase or modifies real records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite');
const db = new PGlite();
let passed = 0;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];
const check = async (name, fn) => { await fn(); console.log(`PASS ${name}`); passed++; };
async function asUser(n) {
  await db.exec('reset role');
  await db.query("select set_config('test.account_id', $1, false)", [id(n)]);
  await db.exec('set role authenticated');
}
const frame = { x: 0.25, y: 0.7, zoom: 2, aspectRatio: 16 / 9, crop: { x: 0.125, y: 0.35, width: 0.5, height: 0.5, zoom: 2 } };
const kept = (coverFrame = frame) => [{ id: 'cover', displayName: 'Cover', order: 0, isCover: true, ...(coverFrame ? { coverFrame } : {}) }];
async function save(attachments = kept(), extras = [], revision = null, project = id(3), profile = id(1)) {
  return scalar('select update_project($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)', [project, profile, ' Updated title ', ' Updated summary ', JSON.stringify(attachments), JSON.stringify(extras), revision]);
}
try {
  await db.exec(`
    create role authenticated; create schema storage;
    grant usage on schema public, storage to authenticated;
    create table profiles(id uuid primary key, account_id uuid);
    create function owns_profile(p_profile_id uuid) returns boolean language sql stable security definer set search_path=public as
      $$ select exists(select 1 from profiles where id=p_profile_id and account_id=nullif(current_setting('test.account_id',true),'')::uuid) $$;
    create function path_profile_id(path text) returns uuid language sql immutable as $$ select split_part(path,'/',1)::uuid $$;
    create table projects(id uuid primary key, profile_id uuid, title text, summary text, revision uuid default gen_random_uuid());
    create table project_attachments(id text primary key, project_id uuid references projects(id), kind text, file_name text, display_name text, extension text, mime_type text, size_bytes bigint, type_label text, storage_path text, status text, is_cover boolean, position integer, metadata jsonb);
    create table storage.objects(bucket_id text, name text);
    grant select,insert,update,delete on projects,project_attachments to authenticated;
    grant select on storage.objects to authenticated;
    alter table projects enable row level security;
    alter table project_attachments enable row level security;
    create policy project_owner on projects for all to authenticated using (owns_profile(profile_id)) with check (owns_profile(profile_id));
    create policy attachment_owner on project_attachments for all to authenticated using (exists(select 1 from projects where id=project_id)) with check (exists(select 1 from projects where id=project_id));
  `);
  const migration = readFileSync(new URL('../supabase/migrations/202609060003_project_cover_reposition.sql', import.meta.url), 'utf8');
  await check('migration applies twice and retains invoker security', async () => {
    await db.exec(migration); await db.exec(migration);
    assert.equal(await scalar("select prosecdef from pg_proc where proname='update_project'"), false);
  });
  await db.query('insert into profiles values ($1,$1),($2,$2)', [id(1),id(2)]);
  await db.query("insert into projects(id,profile_id,title,summary) values ($1,$2,'Original','Summary'),($3,$4,'Other','Summary')", [id(3),id(1),id(4),id(2)]);
  await db.query("insert into project_attachments(id,project_id,kind,file_name,storage_path,metadata,is_cover) values ('cover',$1,'image','original.jpg',$2,$3,true),('foreign',$4,'image','other.jpg','other',null,true)", [id(3), `${id(1)}/original.jpg`, JSON.stringify({ width: 1920, height: 1080, custom: 'keep' }), id(4)]);
  await asUser(1);
  await check('cover saves and reloads with crop, ratio, original file and unrelated metadata intact', async () => {
    const revision = await scalar('select revision::text from projects where id=$1', [id(3)]);
    await save(kept({ ...frame, unwanted: 'discard', crop: { ...frame.crop, unwanted: 'discard' } }), [], revision);
    const row = (await db.query("select * from project_attachments where id='cover'")).rows[0];
    assert.deepEqual(row.metadata, { width: 1920, height: 1080, custom: 'keep', coverFrame: frame });
    assert.equal(row.storage_path, `${id(1)}/original.jpg`);
    assert.equal(row.file_name, 'original.jpg');
    assert.equal(await scalar('select title from projects where id=$1', [id(3)]), 'Updated title');
    assert.notEqual(await scalar('select revision::text from projects where id=$1', [id(3)]), revision);
  });
  await check('older clients omitting the frame preserve the saved crop', async () => {
    await save(kept(null));
    assert.deepEqual(await scalar("select metadata->'coverFrame' from project_attachments where id='cover'"), frame);
  });
  await check('invalid crops reject atomically without changing title, revision or attachments', async () => {
    const before = (await db.query('select * from projects where id=$1', [id(3)])).rows[0];
    for (const invalid of [null, {}, { ...frame, x: -1 }, { ...frame, zoom: 4 }, { ...frame, aspectRatio: 0 }, { ...frame, aspectRatio: 'wide' }, { ...frame, crop: { ...frame.crop, width: 1 } }, { ...frame, crop: { ...frame.crop, zoom: 1 } }]) {
      await assert.rejects(save([{ ...kept()[0], coverFrame: invalid }]), /invalid cover/);
      assert.deepEqual((await db.query('select * from projects where id=$1', [id(3)])).rows[0], before);
      assert.deepEqual(await scalar("select metadata->'coverFrame' from project_attachments where id='cover'"), frame);
    }
  });
  await check('revision conflicts, foreign attachments and another owner remain rejected', async () => {
    await assert.rejects(save(kept(), [], 'stale'), /revision conflict/);
    await assert.rejects(save([{ id: 'foreign', coverFrame: frame }]), /invalid media/);
    await assert.rejects(save([], []), /invalid media/);
    await asUser(2);
    await assert.rejects(save(), /not owner/);
    assert.equal(await scalar('select count(*)::int from project_attachments where project_id=$1', [id(3)]), 0);
    await asUser(1);
  });
  await check('new storage references stay validated and removal results stay intact', async () => {
    const newFile = { id: 'new-cover', kind: 'image', fileName: 'new.jpg', storagePath: `${id(1)}/new.jpg`, metadata: { coverFrame: frame }, isCover: true };
    await assert.rejects(save([], [newFile]), /invalid media storage reference/);
    assert.equal(await scalar("select count(*)::int from project_attachments where id='cover'"), 1);
    await db.exec('reset role');
    await db.query("insert into storage.objects values ('project-media',$1)", [newFile.storagePath]);
    await asUser(1);
    const result = await save([], [newFile]);
    assert.deepEqual(result, { removedAttachmentIds: ['cover'], removedStoragePaths: [`${id(1)}/original.jpg`] });
    assert.deepEqual(await scalar("select metadata->'coverFrame' from project_attachments where id='new-cover'"), frame);
  });
  console.log(`${passed} cover crop database checks passed`);
} finally { await db.close(); }
