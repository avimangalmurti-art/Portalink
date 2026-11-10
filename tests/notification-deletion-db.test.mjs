// Disposable PostgreSQL verification of existing notification permissions.
// This never connects to Supabase or applies a migration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH ?? process.env.PGLITE_MODULE;
const schema = readFileSync(new URL('../supabase/migrations/202608220001_creator_beta.sql', import.meta.url), 'utf8');
const table = schema.match(/create table public\.notifications \([\s\S]*?\n\);/)[0];
const policy = schema.match(/create policy notifications_owner_all[\s\S]*?;/)[0];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('existing owner policy permits exact notification deletion while protecting newer revisions and other accounts', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${id(1)}'),('${id(2)}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;`);
    await db.exec(table);
    await db.exec(`alter table public.notifications enable row level security;
      grant select,insert,update,delete on public.notifications to authenticated;
      ${policy}
      insert into public.notifications(id,account_id,body,created_at) values
        ('${id(11)}','${id(1)}','Old update','2026-11-03T12:00:00Z'),
        ('${id(12)}','${id(1)}','Newer message update','2026-11-03T13:00:00Z'),
        ('${id(13)}','${id(2)}','Another account','2026-11-03T12:00:00Z');`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
    await db.exec('set role authenticated');
    const remove = (notificationId, timestamp, owner = id(1)) => db.query(
      'delete from public.notifications where account_id=$1 and id=$2 and created_at=$3 returning id', [owner, notificationId, timestamp]);
    assert.deepEqual((await remove(id(11), '2026-11-03T12:00:00Z')).rows, [{id:id(11)}]);
    assert.deepEqual((await remove(id(12), '2026-11-03T12:00:00Z')).rows, [], 'An older selection cannot erase a newer message update.');
    assert.deepEqual((await remove(id(13), '2026-11-03T12:00:00Z', id(2))).rows, [], 'RLS denies another account even if request filters are forged.');
    await db.exec('reset role');
    assert.deepEqual((await db.query('select id from public.notifications order by id')).rows, [{id:id(12)},{id:id(13)}]);
    await db.exec('set role anon');
    await assert.rejects(remove(id(12), '2026-11-03T13:00:00Z'), error => error.code === '42501');
  } finally { await db.close(); }
});
