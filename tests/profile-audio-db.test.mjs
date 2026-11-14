import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH ?? process.env.PGLITE_MODULE;
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const migration = filename => readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8');

test('profile audio metadata and immutable objects follow owner, enabled and public-profile boundaries', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const ownerId = id(1);
  const otherId = id(2);
  const profileId = id(11);
  const otherProfileId = id(12);
  const audio = `${profileId}/${id(21)}/audio.m4a`;
  const cover = `${profileId}/${id(22)}/cover.webp`;
  const replacement = `${profileId}/${id(23)}/audio.mp3`;
  const foreignPath = `${otherProfileId}/${id(24)}/audio.wav`;
  const sql = readFileSync(new URL('../supabase/migrations/202611120001_profile_audio_tracks.sql', import.meta.url), 'utf8');

  const setRole = async (role, accountId = null) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [accountId ?? '']);
    await db.exec(`set role ${role}`);
  };
  const addObject = name => db.query("insert into storage.objects (bucket_id, name) values ('profile-audio', $1)", [name]);
  const objects = async () => (await db.query("select name from storage.objects where bucket_id = 'profile-audio' order by name")).rows.map(row => row.name);
  const track = async () => (await db.query('select * from public.profile_audio_tracks where profile_id = $1', [profileId])).rows[0];
  const removeObject = name => db.query("delete from storage.objects where bucket_id = 'profile-audio' and name = $1 returning name", [name]);

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema storage;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.profiles (id uuid primary key, account_id uuid not null, is_private boolean not null default false);
      create table public.profile_follows (target_profile_id uuid not null, follower_account_id uuid not null, status text not null);
      create table storage.buckets (id text primary key, name text not null, public boolean not null, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (bucket_id text references storage.buckets(id), name text, primary key (bucket_id, name));
      alter table public.profiles enable row level security;
      alter table storage.objects enable row level security;
      grant usage on schema public, auth, storage to anon, authenticated;
      grant select on public.profiles, storage.objects to anon, authenticated;
      grant insert, update, delete on storage.objects to authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `);

    const creatorBeta = migration('202608220001_creator_beta.sql');
    const privateBoundary = migration('202609130001_private_content_boundary.sql');
    const functionDefinition = (source, name) => {
      const start = source.indexOf(`create or replace function public.${name}(`);
      const end = source.indexOf('$$;', start);
      assert.ok(start >= 0 && end > start, `Expected the repository's ${name} function`);
      return source.slice(start, end + 3);
    };
    await db.exec(functionDefinition(creatorBeta, 'owns_profile'));
    await db.exec(functionDefinition(creatorBeta, 'path_profile_id'));
    await db.exec(functionDefinition(privateBoundary, 'can_view_profile'));
    await db.exec('create policy profiles_read on public.profiles for select to anon, authenticated using (public.can_view_profile(id));');
    await db.exec(sql);
    await db.query('insert into public.profiles(id,account_id) values ($1,$2), ($3,$4)', [profileId, ownerId, otherProfileId, otherId]);
    await db.query("insert into public.profile_follows values ($1, $2, 'following')", [profileId, otherId]);
    const { rows: [bucket] } = await db.query("select * from storage.buckets where id = 'profile-audio'");
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), 50 * 1024 * 1024);
    assert.deepEqual(bucket.allowed_mime_types, ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/flac', 'image/jpeg', 'image/png', 'image/webp']);

    await setRole('authenticated', ownerId);
    await assert.rejects(addObject(foreignPath), /row-level security/);
    await assert.rejects(addObject(`${profileId}/${id(21)}/audio.svg`), /row-level security/);
    await addObject(audio);
    await addObject(cover);
    await addObject(replacement);
    await assert.rejects(db.query('insert into public.profile_audio_tracks (profile_id, title, audio_path) values ($1,$2,$3)', [profileId, 'Test track', foreignPath]), /check constraint/);

    await setRole('anon');
    assert.deepEqual(await objects(), []);
    await assert.rejects(db.query('insert into public.profile_audio_tracks (profile_id, title, audio_path) values ($1,$2,$3)', [profileId, 'Test track', audio]), /permission denied/);

    await setRole('authenticated', ownerId);
    await db.query('insert into public.profile_audio_tracks (profile_id,title,audio_path,cover_path) values ($1,$2,$3,$4)', [profileId, 'Test track', audio, cover]);
    const firstRevision = (await track()).revision;
    assert.match(firstRevision, /^[0-9a-f-]{36}$/);
    assert.deepEqual((await removeObject(audio)).rows, []);
    assert.deepEqual((await removeObject(cover)).rows, []);
    const attemptedOverwrite = await db.query("update storage.objects set name = $1 where bucket_id = 'profile-audio' and name = $2 returning name", [`${profileId}/${id(25)}/audio.m4a`, audio]);
    assert.deepEqual(attemptedOverwrite.rows, []);

    await setRole('anon');
    assert.equal((await track()).title, 'Test track');
    assert.deepEqual(await objects(), [audio, cover]);
    await setRole('authenticated', otherId);
    assert.deepEqual((await db.query('update public.profile_audio_tracks set enabled = false where profile_id = $1 returning profile_id', [profileId])).rows, []);
    assert.deepEqual((await removeObject(audio)).rows, []);

    await db.exec('reset role');
    await db.query('update public.profiles set is_private = true where id = $1', [profileId]);
    await setRole('authenticated', otherId);
    assert.equal((await db.query('select id from public.profiles where id = $1', [profileId])).rows.length, 1, 'The accepted follower can still view the profile');
    assert.equal(await track(), undefined, 'A private profile has no public soundtrack');
    assert.deepEqual(await objects(), []);
    await setRole('anon');
    assert.equal(await track(), undefined);
    assert.deepEqual(await objects(), []);

    await db.exec('reset role');
    await db.query('update public.profiles set is_private = false where id = $1', [profileId]);
    await setRole('authenticated', ownerId);
    const swapped = await db.query('update public.profile_audio_tracks set audio_path = $1, enabled = false, revision = $2 where profile_id = $3 and revision = $4 returning revision', [replacement, id(30), profileId, firstRevision]);
    assert.equal(swapped.rows[0].revision, id(30));
    assert.deepEqual((await db.query('delete from public.profile_audio_tracks where profile_id = $1 and revision = $2 returning profile_id', [profileId, firstRevision])).rows, []);
    assert.equal((await removeObject(audio)).rows.length, 1, 'A superseded object can be cleaned up');
    assert.deepEqual((await removeObject(replacement)).rows, [], 'Disabling does not unreference the audio');
    await setRole('anon');
    assert.equal(await track(), undefined);
    assert.deepEqual(await objects(), []);
    await setRole('authenticated', ownerId);
    assert.equal((await track()).enabled, false);
    await db.query('delete from public.profile_audio_tracks where profile_id = $1 and revision = $2', [profileId, id(30)]);
    assert.equal((await removeObject(replacement)).rows.length, 1);
    assert.equal((await removeObject(cover)).rows.length, 1);
  } finally {
    await db.close();
  }
});
