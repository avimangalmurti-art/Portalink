// Disposable PostgreSQL only; never applies SQL to the connected backend.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PGLITE_MODULE_PATH;
test('pairs enforce owner writes, visibility, duplicates and cascade and can be updated in place', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  try {
    await db.exec(`create role anon; create role authenticated;
      create table profiles(id uuid primary key,account_id uuid,show_journey boolean,is_private boolean default false,then_now jsonb);
      create table portfolio_categories(id uuid primary key,profile_id uuid,is_hidden boolean default false);
      create table projects(id uuid primary key,profile_id uuid,category_id uuid,is_hidden boolean default false);
      create function owns_profile(pid uuid) returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=pid and account_id=nullif(current_setting('request.account',true),'')::uuid)$$;
      create function can_view_profile(pid uuid) returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=pid and (not is_private or public.owns_profile(pid)))$$;
      grant usage on schema public to anon,authenticated; grant select on profiles,projects,portfolio_categories to anon,authenticated;
      grant update on profiles to authenticated;`);
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
    const edit = (pairId, thenId, nowId) => db.query(
      'update profile_timeline_pairs set then_project_id=$2,now_project_id=$3 where profile_id=$4 and id=$1 returning *',
      [pairId, id(thenId), id(nowId), id(1)],
    );
    await asOwner(1); await add(21,22); await add(21,23); assert.equal((await rows()).length,2);
    await assert.rejects(add(21,22)); await assert.rejects(add(21,21)); await assert.rejects(add(21,24));
    const original = (await rows()).find(pair => pair.now_project_id === id(22));
    await assert.rejects(edit(original.id, 22, 23), { code: '42501' });
    await db.exec('reset role');
    const pending = readFileSync(new URL('../supabase/pending/profile_timeline_pair_edit.sql', import.meta.url), 'utf8');
    await db.exec(pending);
    await db.exec(pending);
    const pendingOrder = readFileSync(new URL('../supabase/pending/profile_timeline_pair_order.sql', import.meta.url), 'utf8');
    await db.exec(pendingOrder);
    await db.exec(pendingOrder);
    await asOwner(1);
    const { rows: [updated] } = await edit(original.id, 22, 23);
    assert.deepEqual(updated, { ...original, then_project_id: id(22), now_project_id: id(23) });
    await assert.rejects(edit(original.id, 21, 23), { code: '23505' });
    await assert.rejects(edit(original.id, 21, 21), { code: '23514' });
    await assert.rejects(edit(original.id, 21, 24), { code: '42501' });
    await assert.rejects(db.query('update profile_timeline_pairs set created_at=now() where id=$1', [original.id]), { code: '42501' });
    const stale = await db.query('update profile_timeline_pairs set now_project_id=$2 where id=$1 and now_project_id=$3 returning id', [original.id, id(21), id(22)]);
    assert.equal(stale.rows.length, 0);
    await db.exec(`reset role; update projects set is_hidden=true where id='${id(23)}'`);
    await asOwner(1); await assert.rejects(edit(original.id, 23, 22), { code: '42501' });
    await db.exec(`reset role; update projects set is_hidden=false where id='${id(23)}'; update portfolio_categories set is_hidden=true where id='${id(31)}'`);
    await asOwner(1); await assert.rejects(edit(original.id, 21, 22), { code: '42501' });
    await db.exec(`reset role; update portfolio_categories set is_hidden=false where id='${id(31)}'`);
    await asOwner(1); await edit(original.id, 21, 22);
    const otherPair = (await rows()).find(pair => pair.id !== original.id);
    const saveOrder = ids => db.query('select save_timeline_pair_order($1, $2::text[])', [id(1), ids]);
    const order = async () => (await db.query('select pair_id from profile_timeline_pair_order where profile_id=$1 order by position', [id(1)]))
      .rows.map(({pair_id}) => pair_id ?? 'legacy');
    const arranged = [otherPair.id, 'legacy', original.id];
    await saveOrder(arranged);
    assert.deepEqual(await order(), arranged);
    await saveOrder(['legacy', original.id, otherPair.id]);
    await saveOrder(arranged);
    await assert.rejects(saveOrder([original.id, original.id]), { code: '23514' });
    await assert.rejects(saveOrder([null]), { code: '23514' });
    await assert.rejects(saveOrder([id(999)]), { code: '42501' });
    assert.deepEqual(await order(), arranged, 'Rejected saves must leave the existing order intact.');
    await asOwner(2); await assert.rejects(add(22,23)); await db.exec('delete from profile_timeline_pairs');
    assert.equal((await edit(original.id, 22, 23)).rows.length, 0);
    await assert.rejects(saveOrder([original.id, otherPair.id, 'legacy']), { code: '42501' });
    await db.exec('delete from profile_timeline_pair_order');
    assert.deepEqual(await order(), arranged);
    await db.exec('reset role; set role anon'); assert.equal((await rows()).length,2);
    await assert.rejects(add(22,23));
    await assert.rejects(edit(original.id, 22, 23), { code: '42501' });
    await assert.rejects(saveOrder(arranged), { code: '42501' });
    assert.deepEqual(await order(), arranged);
    await db.exec('reset role');
    await db.query('update profiles set is_private=true where id=$1', [id(1)]);
    await db.exec('set role anon');
    assert.deepEqual(await order(), []);
    await db.exec('reset role');
    await db.query('update profiles set is_private=false where id=$1', [id(1)]);
    await db.exec('set role anon');
    await db.exec(`reset role; update projects set is_hidden=true where id='${id(23)}'; set role anon`); assert.equal((await rows()).length,1);
    await db.exec(`reset role; update profiles set show_journey=false where id='${id(1)}'; set role anon`); assert.equal((await rows()).length,0);
    assert.deepEqual(await order(), []);
    await asOwner(1); assert.equal((await rows()).length,2);
    assert.deepEqual(await order(), arranged);
    await db.exec('reset role'); const legacy = (await db.query('select then_now from profiles where id=$1',[id(1)])).rows[0].then_now;
    assert.deepEqual(legacy,{then:id(21),now:id(22)});
    await db.query('delete from projects where id=$1',[id(23)]); assert.equal((await rows()).length,1);
    assert.deepEqual(await order(), ['legacy', original.id]);
    await asOwner(1);
    await db.query('update profiles set then_now=$2 where id=$1', [id(1), {then:id(22),now:id(21)}]);
    assert.deepEqual(await order(), ['legacy', original.id], 'Editing the legacy pair keeps its position.');
    await db.query('update profiles set then_now=null where id=$1', [id(1)]);
    assert.deepEqual(await order(), [original.id], 'Removing the legacy pair clears its position.');
    await assert.rejects(saveOrder(['legacy', original.id]), { code: '23503' });
    await db.query('update profiles set then_now=$2 where id=$1', [id(1), legacy]);
    assert.deepEqual(await order(), [original.id], 'A new legacy value does not inherit a removed pair’s position.');
    await saveOrder(['legacy', original.id]);
    await asOwner(1); await db.exec('delete from profile_timeline_pairs'); assert.equal((await rows()).length,0);
    assert.deepEqual(await order(), ['legacy']);

    await db.exec(`reset role;
      create table public.profile_journey_pairs (
        profile_id uuid primary key references public.profiles(id) on delete cascade, pair jsonb not null
      );
      grant select on public.profile_journey_pairs to authenticated;`);
    await db.query('insert into public.profile_journey_pairs values ($1,$2)', [id(1), legacy]);
    await db.exec(pendingOrder);
    await db.query('update profiles set then_now=null where id=$1', [id(1)]);
    await asOwner(1);
    await saveOrder(['legacy']);
    assert.deepEqual(await order(), ['legacy'], 'An unpublished legacy pair retains the owner’s position.');
    await db.exec("reset role; select set_config('request.account','',false); set role anon");
    assert.deepEqual(await order(), []);
    await db.exec('reset role');
    await db.query('delete from public.profile_journey_pairs where profile_id=$1', [id(1)]);
    await asOwner(1);
    assert.deepEqual(await order(), []);
  } finally { await db.close(); }
});
