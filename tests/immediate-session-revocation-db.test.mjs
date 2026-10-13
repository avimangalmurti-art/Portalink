import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
if (!process.env.PGLITE_MODULE_PATH) throw new Error('PGLITE_MODULE_PATH is required.');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
const migration = readFileSync(new URL('../supabase/pending/immediate_account_session_revocation.sql', import.meta.url), 'utf8');
const tables = [...migration.matchAll(/'(public\.[a-z_]+|storage\.objects|realtime\.messages)'/g)].map(match => match[1]).filter(name => !name.includes('account_session'));
const owner = '00000000-0000-0000-0000-000000000001';
const session = '10000000-0000-0000-0000-000000000001';
const otherSession = '10000000-0000-0000-0000-000000000002';
async function claims(db, role = 'authenticated', extra = {}) {
  await db.exec(`reset role; set role ${role};`);
  await db.query(`select set_config('request.jwt.claims',$1,false)`, [JSON.stringify({ role, sub: owner, session_id: session, ...extra })]);
}
async function database(hook) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
    create schema auth; create schema storage; create schema realtime;
    create function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    insert into auth.sessions values ('${session}','${owner}',null),('${otherSession}','${owner}',null);`);
  for (const table of tables) await db.exec(`create table ${table}(id int primary key,owner uuid);
    alter table ${table} enable row level security;
    grant usage on schema ${table.split('.')[0]} to anon, authenticated, service_role;
    grant select,insert,update,delete on ${table} to anon, authenticated, service_role;
    create policy existing_permission on ${table} to authenticated using (owner=(auth.jwt()->>'sub')::uuid) with check(owner=(auth.jwt()->>'sub')::uuid);
    insert into ${table} values(1,'${owner}'),(2,'00000000-0000-0000-0000-000000000002');`);
  await db.exec(`create policy public_view on public.profiles for select to anon using(true);
    create function public.sensitive_rpc() returns int language sql security definer as $$ select count(*)::int from public.profiles $$;
    grant execute on function public.sensitive_rpc() to authenticated;`);
  if (hook) await db.exec(`alter role authenticator set pgrst.db_pre_request='existing.hook';`);
  return db;
}
test('active session keeps existing ownership and all protected tables receive restrictive policies', async () => {
  const db = await database();
  try {
    await db.exec(migration); await claims(db);
    assert.equal(tables.length, 31);
    for (const table of tables) assert.deepEqual((await db.query(`select id from ${table}`)).rows.map(row=>row.id), [1]);
    await db.query('select public.require_active_account_session()');
    await db.exec('reset role');
    const installed = (await db.query(`select count(*)::int as n from pg_policy where polname='account_session_active' and not polpermissive`)).rows[0].n;
    assert.equal(installed, tables.length);
    assert.ok((await db.query(`select rolconfig from pg_roles where rolname='authenticator'`)).rows[0].rolconfig.includes('pgrst.db_pre_request=public.require_active_account_session'));
  } finally { await db.close(); }
});
test('deleting one session immediately blocks its still-unexpired JWT claims on rows, storage and pre-request RPC gate; other device stays active', async () => {
  const db = await database();
  try {
    await db.exec(migration); await claims(db);
    await db.exec(`reset role; delete from auth.sessions where id='${session}';`); await claims(db);
    for (const table of tables) {
      assert.deepEqual((await db.query(`select * from ${table}`)).rows, []);
      await assert.rejects(db.query(`insert into ${table} values(3,'${owner}')`));
      assert.equal((await db.query(`update ${table} set id=4 where id=1 returning id`)).rows.length, 0);
      assert.equal((await db.query(`delete from ${table} returning id`)).rows.length, 0);
    }
    await assert.rejects(db.query('select public.require_active_account_session()'), error => error.code==='PT401');
    // This explicitly models PostgREST's hook before a privileged RPC. RLS alone
    // cannot secure SECURITY DEFINER entry points; live HTTP activation is required.
    await assert.rejects(db.exec('select public.require_active_account_session(); select public.sensitive_rpc();'));
    await claims(db, 'authenticated', { session_id: otherSession });
    await db.query('select public.require_active_account_session()');
    assert.equal((await db.query('select * from public.profiles')).rows.length, 1);
  } finally { await db.close(); }
});
test('missing, malformed, foreign and expired sessions fail closed; public visitors and service processing remain usable', async () => {
  const db = await database();
  try {
    await db.exec(migration);
    for (const extra of [{session_id:null},{session_id:'invalid'},{sub:'00000000-0000-0000-0000-000000000002'}]) {
      await claims(db,'authenticated',extra); await assert.rejects(db.query('select public.require_active_account_session()'));
    }
    await db.exec(`reset role; update auth.sessions set not_after=now()-interval '1 second' where id='${session}';`);
    await claims(db); await assert.rejects(db.query('select public.require_active_account_session()'));
    await claims(db,'anon',{sub:null,session_id:null}); await db.query('select public.require_active_account_session()');
    assert.equal((await db.query('select * from public.profiles')).rows.length,2);
    await claims(db,'service_role',{sub:null,session_id:null}); await db.query('select public.require_active_account_session()');
    assert.equal((await db.query('select * from public.profiles')).rows.length,2);
    await assert.rejects(db.query('select * from auth.sessions'));
  } finally { await db.close(); }
});
test('an existing API hook aborts installation instead of overwriting security configuration', async () => {
  const db = await database(true);
  try {
    await assert.rejects(db.exec(migration), /Existing Data API request hook/);
    await db.exec('rollback');
    assert.equal((await db.query(`select to_regprocedure('public.require_active_account_session()') as fn`)).rows[0].fn,null);
    assert.ok((await db.query(`select rolconfig from pg_roles where rolname='authenticator'`)).rows[0].rolconfig.includes('pgrst.db_pre_request=existing.hook'));
  } finally { await db.close(); }
});
