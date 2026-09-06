// Run with PGLITE_MODULE_PATH pointing to an installed @electric-sql/pglite entry.
// Uses synthetic accounts in memory; never connects to Supabase or sends messages externally.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite');
const db = new PGlite();
let passed = 0;
async function check(name, run) { await run(); console.log(`PASS ${name}`); passed++; }
const profile = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const account = (n) => profile(n + 10);
async function asUser(n) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [account(n)]);
  await db.exec('set role authenticated');
}
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];

try {
  // Supabase platform schemas are represented locally. The actual product
  // messaging schema, functions, grants, triggers and policies run unchanged.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage; create schema realtime;
    grant usage on schema public, auth, storage, realtime to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles(id uuid primary key, account_id uuid unique, name text, is_private boolean default false);
    create table public.profile_follows(follower_profile_id uuid, target_profile_id uuid, follower_account_id uuid, status text);
    create table public.projects(id uuid primary key, profile_id uuid, category_id uuid, summary text);
    create table public.notifications(id uuid primary key default gen_random_uuid(), account_id uuid, body text, read_at timestamptz, created_at timestamptz not null default now());
    create function public.owns_profile(p_profile_id uuid) returns boolean language sql stable security definer set search_path = public as
      $$ select exists (select 1 from public.profiles where id = p_profile_id and account_id = auth.uid()) $$;
    grant select on public.profiles, public.profile_follows to authenticated;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create function storage.foldername(path text) returns text[] language sql immutable as
      $$ select (string_to_array(path, '/'))[1:array_length(string_to_array(path, '/'), 1)-1] $$;
    alter table storage.objects enable row level security;
    grant select, insert, delete on storage.objects to authenticated;
    create table realtime.messages(id uuid primary key default gen_random_uuid(), extension text);
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
    alter table realtime.messages enable row level security;
    grant select, insert on realtime.messages to authenticated;
    create publication supabase_realtime;
  `);
  const old = readFileSync(new URL('../supabase/migrations/202608230003_product_loop_messages.sql', import.meta.url), 'utf8');
  await db.exec(old.slice(old.indexOf('create table public.direct_conversations'), old.indexOf('-- The original durable publisher')));
  const migration = readFileSync(new URL('../supabase/migrations/202609050001_production_messaging.sql', import.meta.url), 'utf8');
  await check('migration applies to the existing messaging schema and can safely be reapplied', async () => {
    await db.exec(migration);
    await db.exec(migration);
  });
  for (const n of [1, 2, 3]) await db.query('insert into profiles(id,account_id,name) values ($1,$2,$3)', [profile(n), account(n), `Test ${n}`]);
  await asUser(1);
  const conversation = await scalar('select get_or_create_direct_conversation($1)', [profile(2)]);
  let first;
  await check('new recipients receive one request and unsending does not permit another request', async () => {
    assert.equal(await scalar('select status from direct_conversations where id=$1', [conversation]), 'request');
    first = (await db.query('select * from send_direct_message($1,$2)', [conversation, 'Request'])).rows[0];
    await assert.rejects(db.query('select * from send_direct_message($1,$2)', [conversation, 'Spam']), /awaiting response/);
    await db.query('delete from direct_messages where id=$1', [first.id]);
    await assert.rejects(db.query('select * from send_direct_message($1,$2)', [conversation, 'Spam after unsend']), /awaiting response/);
  });
  await check('only the recipient can accept a request; direct inserts cannot bypass the rules', async () => {
    await assert.rejects(db.query('select accept_direct_message_request($1)', [conversation]), /requester cannot/);
    await assert.rejects(db.query('insert into direct_messages(conversation_id,sender_profile_id,body) values ($1,$2,$3)', [conversation, profile(1), 'Bypass']), /permission denied/);
    await asUser(3);
    await assert.rejects(db.query('select accept_direct_message_request($1)', [conversation]), /permission denied/);
    await asUser(2);
    await db.query('select accept_direct_message_request($1)', [conversation]);
    assert.equal(await scalar('select status from direct_conversations where id=$1', [conversation]), 'active');
  });
  let earlier, later;
  await check('read receipts advance monotonically and leave later incoming messages unread', async () => {
    await asUser(1);
    earlier = (await db.query('select * from send_direct_message($1,$2)', [conversation, 'Earlier'])).rows[0];
    later = (await db.query('select * from send_direct_message($1,$2)', [conversation, 'Later'])).rows[0];
    await asUser(2);
    await db.query('select mark_direct_conversation_read($1,$2)', [conversation, earlier.created_at]);
    const summaries = (await db.query('select * from direct_conversation_message_summaries($1)', [[conversation]])).rows;
    assert.equal(summaries.length, 1);
    assert.equal(new Date(summaries[0].last_incoming_at).getTime(), new Date(later.created_at).getTime());
    await db.exec('reset role');
    assert.equal(await scalar("select count(*)::int from notifications where conversation_id=$1 and kind='message' and read_at is null", [conversation]), 1);
    await asUser(2);
    await db.query('select mark_direct_conversation_read($1,$2)', [conversation, later.created_at]);
    await db.query('select mark_direct_conversation_read($1,$2)', [conversation, earlier.created_at]);
    assert.equal(new Date(await scalar('select last_read_at from direct_conversation_reads where conversation_id=$1 and profile_id=$2', [conversation, profile(2)])).getTime(), new Date(later.created_at).getTime());
    await assert.rejects(db.query('update direct_conversation_reads set last_read_at=now()'), /permission denied/);
  });
  await check('unread incoming history is retained even when the newest message is outgoing', async () => {
    await db.query('select * from send_direct_message($1,$2)', [conversation, 'Reply']);
    const summary = (await db.query('select * from direct_conversation_message_summaries($1)', [[conversation]])).rows[0];
    assert.equal(summary.last_message.sender_profile_id, profile(2));
    assert.equal(new Date(summary.last_incoming_at).getTime(), new Date(later.created_at).getTime());
  });
  await check('a third account cannot read, alter, react to, or acknowledge another conversation', async () => {
    await asUser(3);
    assert.equal(await scalar('select count(*)::int from direct_messages'), 0);
    assert.equal((await db.query('select * from direct_conversation_message_summaries($1)', [[conversation]])).rows.length, 0);
    await assert.rejects(db.query('select mark_direct_conversation_read($1,now())', [conversation]), /permission denied/);
    await assert.rejects(db.query('insert into direct_message_reactions(message_id,profile_id,emoji) values($1,$2,$3)', [later.id, profile(3), '❤']), /row-level security/);
    assert.equal((await db.query('update direct_messages set body=$1 where id=$2 returning id', ['Intrusion', later.id])).rows.length, 0);
  });
  await check('blocking prevents sends and reactions in both directions', async () => {
    await asUser(2);
    await db.query('insert into direct_message_blocks(blocker_profile_id,blocked_profile_id) values ($1,$2)', [profile(2), profile(1)]);
    await asUser(1);
    await assert.rejects(db.query('select * from send_direct_message($1,$2)', [conversation, 'Blocked']), /blocked/);
    await assert.rejects(db.query('insert into direct_message_reactions(message_id,profile_id,emoji) values($1,$2,$3)', [later.id, profile(1), '❤']), /row-level security/);
    await asUser(2);
    await assert.rejects(db.query('select * from send_direct_message($1,$2)', [conversation, 'Also blocked']), /blocked/);
    await db.query('delete from direct_message_blocks where blocker_profile_id=$1', [profile(2)]);
  });
  await check('nobody and following-only contact settings are enforced by the database', async () => {
    await asUser(3);
    await db.query("insert into messaging_preferences(profile_id,permission) values($1,'nobody')", [profile(3)]);
    await asUser(1);
    await assert.rejects(db.query('select get_or_create_direct_conversation($1)', [profile(3)]), /messages unavailable/);
    await asUser(3);
    await db.query("update messaging_preferences set permission='following' where profile_id=$1", [profile(3)]);
    await asUser(1);
    await assert.rejects(db.query('select get_or_create_direct_conversation($1)', [profile(3)]), /messages unavailable/);
  });
  await check('private typing authorization rejects another account even with the conversation id', async () => {
    await db.query("select set_config('realtime.topic',$1,false)", [`direct-typing:${conversation}`]);
    await asUser(1);
    await db.exec("insert into realtime.messages(extension) values ('broadcast')");
    await asUser(3);
    assert.equal(await scalar('select count(*)::int from realtime.messages'), 0);
    await assert.rejects(db.exec("insert into realtime.messages(extension) values ('broadcast')"), /row-level security/);
  });
  await check('private attachment uploads require conversation access and linked media stays participant-only', async () => {
    const path = `${profile(1)}/${conversation}/${profile(100)}/test.txt`;
    await asUser(3);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('message-media',$1)", [`${profile(3)}/${conversation}/intrusion.txt`]), /row-level security/);
    await asUser(1);
    await db.query("insert into storage.objects(bucket_id,name) values('message-media',$1)", [path]);
    await db.query('select * from send_direct_message($1,$2,$3)', [conversation, '', JSON.stringify([{ id: profile(100), fileName: 'test.txt', mimeType: 'text/plain', sizeBytes: 4, storagePath: path }])]);
    await asUser(2);
    assert.equal(await scalar('select count(*)::int from storage.objects'), 1);
    await asUser(3);
    assert.equal(await scalar('select count(*)::int from storage.objects'), 0);
  });
  await check('the send rate limit survives deleting sent messages', async () => {
    await db.exec('reset role');
    await db.query('insert into direct_message_send_events(sender_profile_id) select $1 from generate_series(1,20)', [profile(1)]);
    await asUser(1);
    await assert.rejects(db.query('select * from send_direct_message($1,$2)', [conversation, 'Throttled']), /rate limit reached/);
  });
  console.log(`${passed} database checks passed using synthetic local accounts.`);
} finally { await db.close(); }
