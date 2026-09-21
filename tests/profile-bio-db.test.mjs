// Isolated PostgreSQL only. Never connects to Supabase or uses real accounts.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH;
test('unbounded Bio migration preserves profiles, optional fields and owner-only writes', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const migration = '202609210001_unbounded_profile_bio.sql';
  const source = name => readFileSync(new URL(name, directory), 'utf8');
  const profile = async () => (await db.query('select * from profiles where id=$1', [id(11)])).rows[0];
  const asUser = async n => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");
  };
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
      grant all on storage.objects to authenticated,service_role;
      grant select,insert on realtime.messages to authenticated;
      create publication supabase_realtime;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    `);
    for (const name of readdirSync(directory).filter(name => name.endsWith('.sql') && name < migration).sort()) {
      await db.exec(source(name).replace(/create extension if not exists pgcrypto;/i, ''));
    }
    for (const n of [1, 2]) await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `bio${n}@example.test`]);
    await db.query('insert into profiles(id,account_id,name,handle,headline) values($1,$2,$3,$4,$5)', [id(11), id(1), 'Bio owner', 'bio_owner', 'Existing bio']);
    const original = await profile();
    await assert.rejects(db.query('update profiles set headline=$1 where id=$2', ['x'.repeat(81), id(11)]), /profiles_headline_check/);

    await db.exec(source(migration));
    await db.exec(source(migration)); // Repeatable without data changes.
    assert.deepEqual(await profile(), original);
    await asUser(1);
    for (const bio of ['x'.repeat(81), 'First paragraph 🌍\n第二段\n'.repeat(1000), 'x'.repeat(1_000_000), '']) {
      assert.equal((await db.query('update profiles set headline=$1 where id=$2 returning headline', [bio, id(11)])).rows[0].headline, bio);
      assert.equal((await profile()).headline, bio);
    }
    await assert.rejects(db.query('update profiles set headline=null where id=$1', [id(11)]), /not-null constraint/);
    await assert.rejects(db.query('update profiles set name=$1 where id=$2', ['x'.repeat(49), id(11)]), /profiles_name_check/);
    await asUser(2);
    assert.equal((await db.query('update profiles set headline=$1 where id=$2 returning id', ['Not mine', id(11)])).rows.length, 0);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','anon',false); set role anon");
    assert.equal((await db.query('update profiles set headline=$1 where id=$2 returning id', ['Guest edit', id(11)])).rows.length, 0);
    assert.equal((await profile()).headline, '');
    await db.exec('reset role');
    await db.exec(readFileSync(new URL('./profile-onboarding.sql', import.meta.url), 'utf8'));
  } finally {
    await db.close();
  }
});
