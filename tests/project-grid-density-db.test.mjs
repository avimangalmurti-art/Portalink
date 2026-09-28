// Isolated PostgreSQL only. Never connects to Supabase or uses real accounts.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH;
test('project density migration preserves data and policies, publishes owner choices and denies visitor writes', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const migration = '202609270001_profile_project_grid_columns.sql';
  const source = name => readFileSync(new URL(name, directory), 'utf8');
  const profile = async () => (await db.query('select * from profiles where id=$1', [id(11)])).rows[0];
  const projects = async () => (await db.query('select * from projects order by position,id')).rows;
  const policies = async () => (await db.query("select policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='profiles' order by policyname")).rows;
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
    for (const n of [1, 2]) await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `grid${n}@example.test`]);
    await db.query('insert into profiles(id,account_id,name,handle,headline,location) values($1,$2,$3,$4,$5,$6)', [id(11), id(1), 'Grid owner', 'grid_owner', 'Existing bio', 'Existing city']);
    await db.query('insert into portfolio_categories(id,profile_id,label) values($1,$2,$3)', [id(21), id(11), 'Projects']);
    for (const n of [31, 32]) await db.query('insert into projects(id,profile_id,category_id,title,summary,position) values($1,$2,$3,$4,$5,$6)', [id(n), id(11), id(21), `Project ${n}`, 'Existing project', n - 33]);
    const original = await profile();
    const originalProjects = await projects();
    const originalPolicies = await policies();
    const privileges = async () => (await db.query("select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='profiles' order by grantee,privilege_type")).rows;
    const originalPrivileges = await privileges();

    await db.exec(source(migration));
    await db.exec(source(migration));
    assert.deepEqual(await profile(), { ...original, project_grid_columns: 2 });
    assert.deepEqual(await projects(), originalProjects);
    assert.deepEqual(await policies(), originalPolicies);
    assert.deepEqual(await privileges(), originalPrivileges);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.profiles'::regclass")).rows[0].relrowsecurity, true);

    await asUser(1);
    for (const columns of [2, 5, 13]) {
      const saved = await db.query('update profiles set project_grid_columns=$1 where id=$2 returning project_grid_columns', [columns, id(11)]);
      assert.equal(saved.rows[0].project_grid_columns, columns);
    }
    for (const columns of [1, 14]) await assert.rejects(db.query('update profiles set project_grid_columns=$1 where id=$2', [columns, id(11)]), /profiles_project_grid_columns_check/);
    await assert.rejects(db.query('update profiles set project_grid_columns=null where id=$1', [id(11)]), /not-null constraint/);
    await db.query('update profiles set project_grid_columns=5 where id=$1', [id(11)]);
    const saved = await profile();
    for (const field of ['name', 'handle', 'headline', 'location', 'avatar_url', 'links', 'social_links', 'is_private']) assert.deepEqual(saved[field], original[field]);
    assert.deepEqual(await projects(), originalProjects);

    await asUser(2);
    assert.equal((await profile()).project_grid_columns, 5);
    assert.equal((await db.query('update profiles set project_grid_columns=2 where id=$1 returning id', [id(11)])).rows.length, 0);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','anon',false); set role anon");
    assert.equal((await profile()).project_grid_columns, 5);
    assert.equal((await db.query('update profiles set project_grid_columns=13 where id=$1 returning id', [id(11)])).rows.length, 0);
    assert.equal((await profile()).project_grid_columns, 5);
  } finally {
    await db.close();
  }
});
