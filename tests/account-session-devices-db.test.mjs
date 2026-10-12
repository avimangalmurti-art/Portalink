import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH;
if (!modulePath) throw new Error('PGLITE_MODULE_PATH is required for session-isolation database checks.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const migration = readFileSync(new URL('../supabase/migrations/202610120001_account_session_devices.sql', import.meta.url), 'utf8');
const owner = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const current = '10000000-0000-0000-0000-000000000001';
const target = '10000000-0000-0000-0000-000000000002';
const foreign = '20000000-0000-0000-0000-000000000001';
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('request.jwt.claims', true),'')::jsonb$$;
    create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
    create table auth.sessions(id uuid primary key, user_id uuid not null, user_agent text, created_at timestamptz not null, refreshed_at timestamp, not_after timestamptz);
    create table auth.refresh_tokens(id int primary key, session_id uuid references auth.sessions(id) on delete cascade);
    insert into auth.sessions values
      ('${current}','${owner}','Safari iPhone',now(),now(),null),
      ('${target}','${owner}','Chrome Windows',now()-interval '1 day',now(),null),
      ('${foreign}','${other}','Foreign',now(),now(),null);
    insert into auth.refresh_tokens values(1,'${current}'),(2,'${target}'),(3,'${foreign}');`);
  await db.exec(migration);
  await db.exec(`set role authenticated;`);
  await db.query(`select set_config('request.jwt.claims',$1,false)`, [JSON.stringify({ sub: owner, session_id: current })]);
  return db;
}
test('session list is scoped to verified caller, marks current session and excludes sensitive fields', async () => {
  const db = await database();
  try {
    const { rows } = await db.query('select * from public.list_my_account_sessions()');
    assert.equal(rows.length,2); assert.equal(rows[0].id,current); assert.equal(rows[0].is_current,true);
    assert.equal(rows[1].id,target); assert.equal(rows[1].is_current,false);
    assert.deepEqual(Object.keys(rows[0]).sort(),['id','user_agent','created_at','refreshed_at','is_current'].sort());
    await assert.rejects(db.query('select * from auth.sessions'));
  } finally { await db.close(); }
});
test('individual revocation removes only owned target and cascades its refresh tokens', async () => {
  const db = await database();
  try {
    assert.equal((await db.query('select public.revoke_my_account_session($1) as removed',[foreign])).rows[0].removed,false);
    assert.equal((await db.query('select public.revoke_my_account_session($1) as removed',[target])).rows[0].removed,true);
    assert.equal((await db.query('select public.revoke_my_account_session($1) as removed',[target])).rows[0].removed,false);
    await assert.rejects(db.query('select public.revoke_my_account_session($1)',[current]));
    await db.exec('reset role');
    assert.deepEqual((await db.query('select id from auth.sessions order by id')).rows.map(r=>r.id),[current,foreign]);
    assert.deepEqual((await db.query('select id from auth.refresh_tokens order by id')).rows.map(r=>r.id),[1,3]);
  } finally { await db.close(); }
});
test('anonymous, expired and revoked caller sessions cannot list or revoke even with remaining JWT claims', async () => {
  const db = await database();
  try {
    await db.exec('set role anon'); await assert.rejects(db.query('select * from public.list_my_account_sessions()'));
    await assert.rejects(db.query('select public.revoke_my_account_session($1)',[target]));
    await db.exec(`reset role; update auth.sessions set not_after=now()-interval '1 second' where id='${current}'; set role authenticated;`);
    await assert.rejects(db.query('select * from public.list_my_account_sessions()'));
    await assert.rejects(db.query('select public.revoke_my_account_session($1)',[target]));
    await db.exec(`reset role; delete from auth.sessions where id='${current}'; set role authenticated;`);
    await assert.rejects(db.query('select * from public.list_my_account_sessions()'));
    await assert.rejects(db.query('select public.revoke_my_account_session($1)',[target]));
    await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:other,session_id:target})]);
    await assert.rejects(db.query('select * from public.list_my_account_sessions()'));
  } finally { await db.close(); }
});
test('pagination handles equal timestamps without duplicates and excludes expired rows', async () => {
  const db = await database();
  try {
    await db.exec(`reset role;
      insert into auth.sessions select ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${owner}',repeat('x',1000),'2025-01-01',null,null from generate_series(1,60) n;
      update auth.sessions set not_after=now()-interval '1 second' where id='${target}'; set role authenticated;`);
    const first = (await db.query('select * from public.list_my_account_sessions()')).rows;
    assert.equal(first.length,51); assert.ok(first.every(row=>row.id!==target));
    assert.ok(first.every(row=>row.user_agent.length<=512));
    const last=first[49];
    const next=(await db.query('select * from public.list_my_account_sessions($1,$2)',[last.created_at,last.id])).rows;
    const combined=[...first.slice(0,50),...next];
    assert.equal(combined.length,61); assert.equal(new Set(combined.map(row=>row.id)).size,61);
    await assert.rejects(db.query('select * from public.list_my_account_sessions($1,null)',[last.created_at]));
  } finally { await db.close(); }
});
