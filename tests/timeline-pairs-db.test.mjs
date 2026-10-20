// Disposable PostgreSQL only; never applies SQL to the connected backend.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PGLITE_MODULE_PATH;
test('additional pairs enforce owner writes, visibility, duplicates, and cascade while preserving legacy', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  try {
    await db.exec(`create role anon; create role authenticated;
      create table profiles(id uuid primary key,account_id uuid,show_journey boolean,is_private boolean default false,then_now jsonb);
      create table portfolio_categories(id uuid primary key,profile_id uuid,is_hidden boolean default false);
      create table projects(id uuid primary key,profile_id uuid,category_id uuid,is_hidden boolean default false);
      create function owns_profile(pid uuid) returns boolean language sql stable as $$select exists(select 1 from profiles where id=pid and account_id=nullif(current_setting('request.account',true),'')::uuid)$$;
      create function can_view_profile(pid uuid) returns boolean language sql stable as $$select exists(select 1 from profiles where id=pid and (not is_private or owns_profile(pid)))$$;
      grant usage on schema public to anon,authenticated; grant select on profiles,projects,portfolio_categories to anon,authenticated;`);
    for (const n of [1,2]) {
      await db.query('insert into profiles values($1,$2,true,false,$3)', [id(n),id(n+10),{then:id(21),now:id(22)}]);
      await db.query('insert into portfolio_categories(id,profile_id) values($1,$2)',[id(n+30),id(n)]);
    }
    for (const n of [21,22,23]) await db.query('insert into projects(id,profile_id,category_id) values($1,$2,$3)',[id(n),id(1),id(31)]);
    await db.query('insert into projects(id,profile_id,category_id) values($1,$2,$3)',[id(24),id(2),id(32)]);
    await db.exec(readFileSync(new URL('../supabase/migrations/202610150002_profile_timeline_pairs.sql', import.meta.url),'utf8'));
    const asOwner = async n => { await db.exec('reset role'); await db.query("select set_config('request.account',$1,false)",[id(n+10)]); await db.exec('set role authenticated'); };
    const add = (a,b) => db.query('insert into profile_timeline_pairs(profile_id,then_project_id,now_project_id) values($1,$2,$3)',[id(1),id(a),id(b)]);
    const rows = async () => (await db.query('select * from profile_timeline_pairs')).rows;
    await asOwner(1); await add(21,22); await add(21,23); assert.equal((await rows()).length,2);
    await assert.rejects(add(21,22)); await assert.rejects(add(21,21)); await assert.rejects(add(21,24));
    await asOwner(2); await assert.rejects(add(22,23)); await db.exec('delete from profile_timeline_pairs');
    await db.exec('reset role; set role anon'); assert.equal((await rows()).length,2);
    await assert.rejects(add(22,23));
    await db.exec(`reset role; update projects set is_hidden=true where id='${id(23)}'; set role anon`); assert.equal((await rows()).length,1);
    await db.exec(`reset role; update profiles set show_journey=false where id='${id(1)}'; set role anon`); assert.equal((await rows()).length,0);
    await asOwner(1); assert.equal((await rows()).length,2);
    await db.exec('reset role'); const legacy = (await db.query('select then_now from profiles where id=$1',[id(1)])).rows[0].then_now;
    assert.deepEqual(legacy,{then:id(21),now:id(22)});
    await db.query('delete from projects where id=$1',[id(23)]); assert.equal((await rows()).length,1);
    await asOwner(1); await db.exec('delete from profile_timeline_pairs'); assert.equal((await rows()).length,0);
  } finally { await db.close(); }
});
