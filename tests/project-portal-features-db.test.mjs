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
