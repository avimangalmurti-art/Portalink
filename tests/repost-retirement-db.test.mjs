// Executes only in disposable PostgreSQL. Never connects to Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH ?? process.env.PGLITE_MODULE;
const guard = readFileSync(new URL('../supabase/pending/retire_reposts.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/migrations/202608220001_creator_beta.sql', import.meta.url), 'utf8');
const engagementTable = schema.match(/create table public\.project_engagement \([\s\S]*?\n\);/)[0];
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

async function database() {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.projects(id uuid primary key);
    insert into auth.users values ('${id(1)}'),('${id(2)}'),('${id(3)}');
    insert into public.projects values ('${id(11)}'),('${id(12)}');`);
  await db.exec(engagementTable);
  return db;
}

test('pending repost guard is repeatable, preserves history and rejects new or retargeted reposts', { skip: !modulePath }, async () => {
  const db = await database();
  const rows = async () => (await db.query('select account_id,project_id,kind,created_at from public.project_engagement order by account_id,project_id,kind')).rows;
  const rejected = sql => assert.rejects(db.exec(sql), error => error.code === '23514' && /Reposts are no longer supported/.test(error.message));
  try {
    await db.exec(`insert into public.project_engagement(account_id,project_id,kind,created_at) values
      ('${id(1)}','${id(11)}','repost','2025-01-01Z'),
      ('${id(2)}','${id(11)}','like','2025-01-01Z'),
      ('${id(3)}','${id(11)}','save','2025-01-01Z');`);
    const original = await rows();
    await db.exec(guard); await db.exec(guard);
    assert.deepEqual(await rows(), original, 'Installing the guard never rewrites or deletes existing interactions.');
    await db.exec(`insert into public.project_engagement(account_id,project_id,kind) values
      ('${id(1)}','${id(11)}','like'),('${id(1)}','${id(11)}','save');`);
    await rejected(`insert into public.project_engagement(account_id,project_id,kind) values ('${id(2)}','${id(12)}','repost');`);
    await rejected(`insert into public.project_engagement(account_id,project_id,kind) values ('${id(1)}','${id(11)}','repost') on conflict do nothing;`);
    await rejected(`update public.project_engagement set kind='repost' where account_id='${id(2)}' and kind='like';`);
    await rejected(`update public.project_engagement set project_id='${id(12)}' where kind='repost';`);
    await rejected(`update public.project_engagement set account_id='${id(3)}' where kind='repost';`);
    await db.exec(`update public.project_engagement set created_at='2025-02-01Z' where kind='repost';`);
    assert.equal((await rows()).filter(row => row.kind === 'repost').length, 1, 'Historical identity remains grandfathered.');
    assert.deepEqual((await rows()).map(row => row.kind).sort(), ['like', 'like', 'repost', 'save', 'save']);
  } finally { await db.close(); }
});

test('pending guard keeps existing RLS/grants and permits account-owned likes and saves without public function access', { skip: !modulePath }, async () => {
  const db = await database();
  try {
    await db.exec(`create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;
      alter table public.project_engagement enable row level security;
      grant select,insert,update,delete on public.project_engagement to authenticated;
      create policy engagement_read_own on public.project_engagement for select to authenticated using(account_id=auth.uid());
      create policy engagement_insert_own on public.project_engagement for insert to authenticated with check(account_id=auth.uid());
      create policy engagement_delete_own on public.project_engagement for delete to authenticated using(account_id=auth.uid());`);
    const access = async () => ({
      table: (await db.query("select relrowsecurity,relacl::text from pg_class where oid='public.project_engagement'::regclass")).rows,
      policies: (await db.query("select policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='project_engagement' order by policyname")).rows,
    });
    const previousAccess = await access();
    await db.exec(guard);
    assert.deepEqual(await access(), previousAccess);
    const functionAccess = (await db.query("select p.prosecdef,has_function_privilege('authenticated',p.oid,'execute') as client_execute from pg_proc p where p.oid='public.guard_retired_project_reposts()'::regprocedure")).rows[0];
    assert.equal(functionAccess.prosecdef, false);
    assert.equal(functionAccess.client_execute, false);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
    await db.exec('set role authenticated');
    await db.exec(`insert into public.project_engagement(account_id,project_id,kind) values ('${id(1)}','${id(11)}','like'),('${id(1)}','${id(11)}','save');`);
    await assert.rejects(db.exec(`insert into public.project_engagement(account_id,project_id,kind) values ('${id(1)}','${id(12)}','repost');`), error => error.code === '23514');
    await assert.rejects(db.exec(`insert into public.project_engagement(account_id,project_id,kind) values ('${id(2)}','${id(12)}','like');`), error => error.code === '42501');
    const reassigned = await db.query(`update public.project_engagement set account_id='${id(2)}' where kind='like' returning account_id;`);
    assert.deepEqual(reassigned.rows, [], 'Without an UPDATE policy the existing row cannot be reassigned.');
    assert.equal((await db.query("select account_id from public.project_engagement where kind='like'")).rows[0].account_id, id(1));
    await db.exec('reset role; set role anon');
    await assert.rejects(db.exec(`insert into public.project_engagement(account_id,project_id,kind) values ('${id(1)}','${id(12)}','like');`), error => error.code === '42501');
  } finally { await db.close(); }
});
