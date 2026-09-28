// Isolated PostgreSQL only. No hosted database or credentials are used.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH;
test('feed RPC pages every eligible project in stable order and preserves public/private membership', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const migration = '202609280002_project_feed_pages.sql';
  const source = name => readFileSync(new URL(name, directory), 'utf8');
  const asUser = async n => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']);
    await db.query("select set_config('request.jwt.claim.role',$1,false)", [n ? 'authenticated' : 'anon']);
    await db.exec(`set role ${n ? 'authenticated' : 'anon'}`);
  };
  const feed = async (scope, date = null, cursor = null, limit = 121) =>
    (await db.query('select * from project_feed_page($1,$2,$3,$4)', [scope, date, cursor, limit])).rows;
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
    for (const n of [1, 2, 3, 4]) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `feed${n}@example.test`]);
      await db.query('insert into profiles(id,account_id,name,handle,is_private) values($1,$2,$3,$4,$5)', [id(n + 10), id(n), `Profile ${n}`, `feed_${n}`, n === 2]);
      await db.query('insert into portfolio_categories(id,profile_id,label) values($1,$2,$3)', [id(n + 20), id(n + 10), 'Projects']);
    }
    await db.query("insert into portfolio_categories(id,profile_id,label,is_hidden) values($1,$2,'Hidden portal',true)", [id(29), id(11)]);
    for (let n = 100; n < 170; n++) {
      await db.query("insert into projects(id,profile_id,category_id,title,summary,published_at,position) values($1,$2,$3,$4,'Existing text','2026-09-01 12:00:00+00',$5)", [id(n), id(11), id(21), `Public ${n}`, n - 200]);
    }
    for (const [n, profile, category, hidden] of [[200, 12, 22, false], [201, 11, 21, true], [202, 11, 29, false]]) {
      await db.query("insert into projects(id,profile_id,category_id,title,summary,is_hidden,published_at) values($1,$2,$3,'Protected','Existing',$4,'2026-09-02')", [id(n), id(profile), id(category), hidden]);
    }
    for (const target of [11, 12]) await db.query("insert into profile_follows(follower_account_id,follower_profile_id,target_profile_id,status) values($1,$2,$3,'following')", [id(3), id(13), id(target)]);
    await db.query("insert into profile_follows(follower_account_id,follower_profile_id,target_profile_id,status) values($1,$2,$3,'pending')", [id(4), id(14), id(12)]);
    const original = (await db.query('select * from projects order by id')).rows;
    await db.exec(source(migration)); await db.exec(source(migration));
    assert.deepEqual((await db.query('select * from projects order by id')).rows, original);

    await asUser(null);
    assert.equal((await feed('home')).length, 0);
    const global = await feed('global');
    assert.equal(global.length, 70);
    assert.ok(global.every(row => row.creator.id === id(11) && row.category.id === id(21)));
    assert.equal(global[0].creator.account_id, undefined);
    assert.equal((await feed('invalid')).length, 0);

    await asUser(1);
    const found = [];
    let cursor = null;
    do {
      const page = await feed('home', cursor?.published_at, cursor?.id, 13);
      found.push(...page.map(row => row.project.id));
      cursor = page.length === 13 ? page.at(-1).project : null;
    } while (cursor);
    assert.deepEqual(found, Array.from({ length: 70 }, (_, index) => id(index + 100)));
    assert.equal(new Set(found).size, 70);

    await asUser(3);
    const following = await feed('home');
    assert.equal(following.length, 71); assert.equal(following[0].project.id, id(200));
    assert.equal((await feed('global')).length, 70);
    await asUser(4);
    assert.equal((await feed('home')).length, 0);
    await asUser(2);
    assert.equal((await feed('home'))[0].project.id, id(200));
    assert.equal((await feed('global')).some(row => row.project.id === id(200)), false);
  } finally { await db.close(); }
});
