// Isolated PostgreSQL only. No hosted database or credentials are used.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH;
test('public search is bounded, indexed, finds older content and preserves private/hidden boundaries', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const source = name => readFileSync(new URL(name, directory), 'utf8');
  const asUser = async n => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']);
    await db.query("select set_config('request.jwt.claim.role',$1,false)", [n ? 'authenticated' : 'anon']);
    await db.exec(`set role ${n ? 'authenticated' : 'anon'}`);
  };
  const search = async (terms, city = null) => (await db.query('select * from search_public_content($1,$2)', [terms, city])).rows;
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
    // Existing schema and RLS plus search alone: this RPC has no dependency on
    // the other proposed performance migrations.
    for (const name of readdirSync(directory).filter(name => name.endsWith('.sql') && name < '202609280001').sort()) {
      await db.exec(source(name).replace(/create extension if not exists pgcrypto;/i, ''));
    }
    for (let n = 1; n <= 105; n++) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `search${n}@example.test`]);
      await db.query('insert into profiles(id,account_id,name,handle,location,is_private) values($1,$2,$3,$4,$5,$6)', [id(n + 1000), id(n), n === 105 ? 'Unicorn Designer' : `Creator ${n}`, `creator_${n}`, n === 104 ? 'Yorkshire, UK' : 'New York, USA', n === 103]);
      await db.query('insert into portfolio_categories(id,profile_id,label,is_hidden) values($1,$2,$3,$4)', [id(n + 2000), id(n + 1000), n === 101 ? 'Typography' : 'Projects', n === 102]);
    }
    for (let n = 1; n <= 140; n++) {
      await db.query("insert into projects(id,profile_id,category_id,title,summary,topic_keys,published_at,position) values($1,$2,$3,$4,'Design archive',$5,$6,$7)", [id(n + 3000), id(1001), id(2001), n === 140 ? 'Unicorn Archive' : `Design ${n}`, ['print-design'], n === 140 ? '2020-01-01' : '2026-09-01', n]);
    }
    for (const n of [101, 102, 103, 104]) {
      await db.query("insert into projects(id,profile_id,category_id,title,summary,is_hidden,published_at) values($1,$2,$3,'Secret Unicorn Lettering','Art catalogue',false,'2026-09-02')", [id(n + 4000), id(n + 1000), id(n + 2000)]);
    }
    await db.query("insert into projects(id,profile_id,category_id,title,summary,is_hidden) values($1,$2,$3,'Secret Unicorn Hidden','Hidden',true)", [id(4999), id(1001), id(2001)]);
    await db.query("insert into profile_follows(follower_account_id,follower_profile_id,target_profile_id,status) values($1,$2,$3,'following')", [id(1), id(1001), id(1103)]);
    const original = (await db.query('select * from projects order by id')).rows;
    const migration = source('202609280005_public_content_search.sql');
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query('select * from projects order by id')).rows, original);
    const indexes = (await db.query("select indexname from pg_indexes where indexname like '%search_idx'")).rows;
    assert.equal(indexes.length, 3);
    const fn = (await db.query("select prosecdef from pg_proc where proname = 'search_public_content'")).rows[0];
    assert.equal(fn.prosecdef, false);

    await asUser(null);
    const unicorn = await search(['unicorn']);
    assert.ok(unicorn.some(row => row.id === id(1105) && row.kind === 'profile'));
    assert.ok(unicorn.some(row => row.id === id(3140) && row.kind === 'project'));
    for (const hidden of [4102, 4103, 4999]) assert.equal(unicorn.some(row => row.id === id(hidden)), false);
    assert.equal((await search(['typo', 'lett'])).some(row => row.id === id(4101)), true, 'terms can match across category and title');
    assert.equal((await search(['art'])).some(row => row.id === id(4101)), true);
    assert.equal((await search(['ar'])).some(row => row.id === id(4101)), false, 'short tokens do not match arbitrary prefixes');
    assert.equal((await search(['print', 'design'])).filter(row => row.kind === 'project').length, 30);
    const local = await search(['unicorn'], 'New York');
    assert.equal(local.some(row => row.id === id(4104)), false);
    assert.equal((await search(['unicorn'], 'York')).some(row => row.id === id(4104)), false, 'city word must not match Yorkshire');
    const bounded = await search([]);
    assert.equal(bounded.filter(row => row.kind === 'profile').length, 20);
    assert.equal(bounded.filter(row => row.kind === 'project').length, 30);
    assert.deepEqual(await search(['design']), await search(['design']), 'ordering is deterministic');
    await assert.rejects(search(['bad:*']), /shorter search/);
    await assert.rejects(search(Array(33).fill('design')), /shorter search/);
    await asUser(1);
    assert.equal((await search(['unicorn'])).some(row => row.id === id(4103)), false, 'confirmed followers still receive public search only');
    await asUser(103);
    assert.equal((await search(['unicorn'])).some(row => row.id === id(4103)), false, 'owner does not publish private content by searching');
  } finally { await db.close(); }
});
