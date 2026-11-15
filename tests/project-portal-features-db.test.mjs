import assert from 'node:assert/strict';
import test from 'node:test';
import { pgliteModulePath, replaySupabaseSchema } from './support/replay-supabase-schema.mjs';

const id = number => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const ownerAccount = id(1);
const followerAccount = id(2);
const otherAccount = id(3);
const ownerProfile = id(11);
const followerProfile = id(12);
const otherProfile = id(13);
const primaryPortal = id(21);
const secondPortal = id(22);
const thirdPortal = id(23);
const foreignPortal = id(24);
const project = id(31);

test('featured Portal memberships preserve access, identity, and atomic owner edits after a fresh rebuild', { skip: !pgliteModulePath }, async t => {
  const { db } = await replaySupabaseSchema();
  t.after(() => db.close());
  await db.exec(`
    insert into auth.users (id) values ('${ownerAccount}'), ('${followerAccount}'), ('${otherAccount}');
    insert into public.profiles (id, account_id, name, handle, headline) values
      ('${ownerProfile}', '${ownerAccount}', 'Owner', 'featureowner', 'Owner'),
      ('${followerProfile}', '${followerAccount}', 'Follower', 'featurefollower', 'Follower'),
      ('${otherProfile}', '${otherAccount}', 'Other', 'featureother', 'Other');
    insert into public.portfolio_categories (id, profile_id, label) values
      ('${primaryPortal}', '${ownerProfile}', 'Primary'),
      ('${secondPortal}', '${ownerProfile}', 'Second'),
      ('${thirdPortal}', '${ownerProfile}', 'Third'),
      ('${foreignPortal}', '${otherProfile}', 'Foreign');
    insert into public.projects (id, profile_id, category_id, title, summary)
    values ('${project}', '${ownerProfile}', '${primaryPortal}', 'Original', 'Original content');
    insert into public.profile_follows (follower_account_id, follower_profile_id, target_profile_id, status)
    values ('${followerAccount}', '${followerProfile}', '${ownerProfile}', 'following'),
      ('${otherAccount}', '${otherProfile}', '${ownerProfile}', 'pending');
  `);

  const save = async categories => (await db.query(
    'select public.set_project_featured_portals($1::uuid, $2::uuid[]) as ids',
    [project, categories],
  )).rows[0].ids;
  const placements = async () => (await db.query(
    'select category_id from public.project_portal_features where project_id = $1 order by category_id',
    [project],
  )).rows.map(row => row.category_id);
  const as = async (role, account = '') => {
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [account]);
  };
  const setHidden = (table, row, hidden) => db.query(
    `update public.${table} set is_hidden = $2 where id = $1`, [row, hidden],
  );
  const owner = () => as('authenticated', ownerAccount);

  await owner();
  assert.deepEqual(await save([thirdPortal, primaryPortal, secondPortal, thirdPortal]), [secondPortal, thirdPortal]);
  assert.deepEqual(await placements(), [secondPortal, thirdPortal]);
  await assert.rejects(save([foreignPortal]), { code: '22023' });
  await assert.rejects(save([id(99)]), { code: '22023' });
  await assert.rejects(save([null]), { code: '22023' });
  assert.deepEqual(await placements(), [secondPortal, thirdPortal], 'an invalid save leaves the existing placements intact');
  await assert.rejects(db.query('delete from public.project_portal_features where project_id = $1', [project]), { code: '42501' });

  await as('anon');
  assert.deepEqual(await placements(), [secondPortal, thirdPortal]);
  await assert.rejects(save([]), { code: '42501' });
  await as('authenticated', otherAccount);
  await assert.rejects(save([]), { code: '42501' });
  assert.deepEqual(await placements(), [secondPortal, thirdPortal]);

  await owner();
  await setHidden('portfolio_categories', thirdPortal, true);
  assert.deepEqual(await placements(), [secondPortal, thirdPortal], 'the owner can manage a hidden extra placement');
  await as('anon');
  assert.deepEqual(await placements(), [secondPortal]);
  await owner();
  await setHidden('portfolio_categories', primaryPortal, true);
  await as('anon');
  assert.deepEqual(await placements(), [], 'a public destination cannot expose work from a hidden primary Portal');
  await owner();
  await setHidden('portfolio_categories', primaryPortal, false);
  await setHidden('projects', project, true);
  await as('anon');
  assert.deepEqual(await placements(), []);

  await owner();
  await setHidden('projects', project, false);
  await db.query('update public.profiles set is_private = true where id = $1', [ownerProfile]);
  await as('anon');
  assert.deepEqual(await placements(), []);
  await as('authenticated', otherAccount);
  assert.deepEqual(await placements(), [], 'pending followers cannot see private placements');
  await as('authenticated', followerAccount);
  assert.deepEqual(await placements(), [secondPortal], 'accepted followers retain ordinary access to private work');

  await owner();
  assert.deepEqual(await save([]), []);
  assert.deepEqual(await placements(), []);
  assert.deepEqual(await save([secondPortal, thirdPortal]), [secondPortal, thirdPortal]);
  await db.query('delete from public.portfolio_categories where id = $1', [thirdPortal]);
  assert.deepEqual(await placements(), [secondPortal]);
  assert.deepEqual((await db.query('select category_id, title from public.projects where id = $1', [project])).rows,
    [{ category_id: primaryPortal, title: 'Original' }], 'removing a featured Portal does not remove the project');
  await db.query('delete from public.projects where id = $1', [project]);
  assert.deepEqual(await placements(), []);
  await db.exec('reset role');
  assert.deepEqual(await placements(), [], 'deletion removed the row rather than only masking it under RLS');
});

test('an owner can arrange home and featured projects together without changing another Portal or exposing hidden projects', { skip: !pgliteModulePath }, async t => {
  const { db } = await replaySupabaseSchema();
  t.after(() => db.close());
  const otherFeatured = id(32);
  const destinationHome = id(33);
  const newHome = id(34);
  await db.exec(`
    insert into auth.users (id) values ('${ownerAccount}'), ('${followerAccount}'), ('${otherAccount}');
    insert into public.profiles (id, account_id, name, handle, headline) values
      ('${ownerProfile}', '${ownerAccount}', 'Owner', 'arrangementowner', 'Owner'),
      ('${followerProfile}', '${followerAccount}', 'Follower', 'arrangementfollower', 'Follower'),
      ('${otherProfile}', '${otherAccount}', 'Other', 'arrangementother', 'Other');
    insert into public.profile_follows (follower_account_id, follower_profile_id, target_profile_id, status)
    values ('${followerAccount}', '${followerProfile}', '${ownerProfile}', 'following');
    insert into public.portfolio_categories (id, profile_id, label) values
      ('${primaryPortal}', '${ownerProfile}', 'Primary'),
      ('${secondPortal}', '${ownerProfile}', 'Second'),
      ('${thirdPortal}', '${ownerProfile}', 'Third'),
      ('${foreignPortal}', '${otherProfile}', 'Foreign');
    insert into public.projects (id, profile_id, category_id, title, summary, published_at, is_pinned) values
      ('${project}', '${ownerProfile}', '${primaryPortal}', 'First', 'Project', '2026-10-01', true),
      ('${otherFeatured}', '${ownerProfile}', '${primaryPortal}', 'Second', 'Project', '2026-10-02', false),
      ('${destinationHome}', '${ownerProfile}', '${secondPortal}', 'Third', 'Project', '2026-10-03', false),
      ('${newHome}', '${ownerProfile}', '${secondPortal}', 'Fourth', 'Project', '2026-10-04', false);
    update public.projects set position = case id
      when '${project}' then -4
      when '${destinationHome}' then -3
      when '${otherFeatured}' then -2
      else -1 end;
  `);

  async function as(role, account = '') {
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [account]);
  }
  const owner = () => as('authenticated', ownerAccount);
  const feature = (projectId, categories) => db.query('select public.set_project_featured_portals($1, $2)', [projectId, categories]);
  const arrange = (categoryId, order, hidden = [], pinned = []) => db.query(
    'select public.save_portal_project_arrangement($1, $2, $3, $4, $5)', [ownerProfile, categoryId, order, hidden, pinned],
  );
  const rows = async categoryId => (await db.query(
    'select * from public.get_portal_project_arrangement($1, $2)', [ownerProfile, categoryId],
  )).rows;
  const order = async categoryId => (await rows(categoryId)).map(row => row.project_id);
  const ranked = async categoryId => (await db.query(
    'select project_id from public.portal_project_positions where category_id = $1 order by position', [categoryId],
  )).rows.map(row => row.project_id);
  const wall = async () => (await db.query(
    'select id from public.projects where profile_id = $1 order by position', [ownerProfile],
  )).rows.map(row => row.id);

  await owner();
  await arrange(primaryPortal, [otherFeatured, project], [], [project]);
  assert.deepEqual(await ranked(primaryPortal), [], 'a home-only Portal keeps legacy storage');
  assert.deepEqual(await wall(), [otherFeatured, destinationHome, project, newHome]);
  await feature(project, [secondPortal, thirdPortal]);
  await feature(otherFeatured, [secondPortal, thirdPortal]);
  assert.deepEqual(await order(secondPortal), [destinationHome, newHome, otherFeatured, project]);
  assert.deepEqual(await order(thirdPortal), [otherFeatured, project]);

  const wallBefore = await wall();
  await arrange(secondPortal, [project, destinationHome, otherFeatured, newHome]);
  await arrange(thirdPortal, [project, otherFeatured]);
  assert.deepEqual(await order(secondPortal), [project, destinationHome, otherFeatured, newHome]);
  assert.deepEqual(await order(thirdPortal), [project, otherFeatured]);
  assert.deepEqual(await wall(), wallBefore, 'moving only featured projects does not rewrite wall order');
  assert.deepEqual(await order(primaryPortal), [otherFeatured, project]);
  assert.equal((await rows(secondPortal))[0].is_pinned, false, 'a home pin does not follow a featured project');

  await arrange(secondPortal, [newHome, project, destinationHome, otherFeatured], [], [destinationHome]);
  assert.deepEqual(await wall(), [otherFeatured, newHome, project, destinationHome], 'home order uses the existing wall slots');
  assert.deepEqual(await order(thirdPortal), [project, otherFeatured], 'a different Portal retains its own saved sequence');
  assert.equal((await rows(secondPortal)).find(row => row.project_id === destinationHome).is_pinned, true);
  const savedOrder = await order(secondPortal);
  for (const invalidOrder of [[project, newHome], [project, newHome, newHome, otherFeatured],
    [project, newHome, otherFeatured, id(99)], [project, newHome, otherFeatured, null]]) {
    await assert.rejects(arrange(secondPortal, invalidOrder), { code: '22023' });
  }
  await assert.rejects(arrange(secondPortal, savedOrder, [project]), { code: '22023' });
  await assert.rejects(arrange(secondPortal, savedOrder, [], [project]), { code: '22023' });
  await assert.rejects(arrange(foreignPortal, []), { code: '22023' });
  assert.deepEqual(await order(secondPortal), savedOrder);
  await assert.rejects(db.query('delete from public.portal_project_positions where category_id = $1', [secondPortal]), { code: '42501' });

  const savedWall = await wall();
  await db.exec(`reset role;
    create function public.reject_test_portal_order() returns trigger language plpgsql as $$
    begin raise exception 'test rank write failure'; end;
    $$;
    create trigger reject_test_portal_order before insert on public.portal_project_positions
    for each row execute function public.reject_test_portal_order();
  `);
  await owner();
  await assert.rejects(arrange(secondPortal, [destinationHome, project, newHome, otherFeatured]), /test rank write failure/);
  assert.deepEqual(await order(secondPortal), savedOrder);
  assert.deepEqual(await wall(), savedWall, 'a failed rank write rolls back the home arrangement');
  assert.equal((await rows(secondPortal)).find(row => row.project_id === destinationHome).is_pinned, true);
  await db.exec('reset role; drop trigger reject_test_portal_order on public.portal_project_positions; drop function public.reject_test_portal_order()');

  await as('anon');
  assert.deepEqual(await order(secondPortal), savedOrder);
  await assert.rejects(arrange(secondPortal, savedOrder), { code: '42501' });
  await as('authenticated', otherAccount);
  await assert.rejects(arrange(secondPortal, savedOrder), { code: '42501' });
  await owner();
  await db.query('update public.projects set is_hidden = true where id = $1', [project]);
  assert.equal((await rows(secondPortal)).find(row => row.project_id === project).is_hidden, false, 'a home hide flag is not copied to a feature');
  await as('anon');
  assert.deepEqual(await order(secondPortal), savedOrder.filter(id => id !== project));
  assert.deepEqual(await ranked(secondPortal), savedOrder.filter(id => id !== project));
  await owner();
  await db.query('update public.projects set is_hidden = false where id = $1', [project]);
  await db.query('update public.portfolio_categories set is_hidden = true where id = $1', [primaryPortal]);
  await as('anon');
  assert.deepEqual(await order(secondPortal), [newHome, destinationHome]);
  assert.deepEqual(await ranked(secondPortal), [newHome, destinationHome]);
  await owner();
  await db.query('update public.portfolio_categories set is_hidden = false where id = $1', [primaryPortal]);
  await db.query('update public.portfolio_categories set is_hidden = true where id = $1', [secondPortal]);
  await as('anon');
  assert.deepEqual(await order(secondPortal), []);
  assert.deepEqual(await ranked(secondPortal), []);
  await owner();
  await db.query('update public.portfolio_categories set is_hidden = false where id = $1', [secondPortal]);
  await db.query('update public.profiles set is_private = true where id = $1', [ownerProfile]);
  await as('anon');
  assert.deepEqual(await order(secondPortal), []);
  await as('authenticated', followerAccount);
  assert.deepEqual(await order(secondPortal), savedOrder);

  await owner();
  await feature(project, [thirdPortal]);
  await db.exec('reset role');
  assert.deepEqual(await ranked(secondPortal), savedOrder.filter(id => id !== project), 'unfeaturing deletes the rank');
  await owner();
  await feature(project, [secondPortal, thirdPortal]);
  assert.deepEqual(await order(secondPortal), [...savedOrder.filter(id => id !== project), project]);
  assert.deepEqual(await order(thirdPortal), [project, otherFeatured]);
});
