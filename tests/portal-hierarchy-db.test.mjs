import assert from 'node:assert/strict';
import test from 'node:test';
import { pgliteModulePath, replaySupabaseSchema } from './support/replay-supabase-schema.mjs';

const id = (number) => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const owner = id(1);
const follower = id(2);
const stranger = id(3);
const ownerProfile = id(11);
const followerProfile = id(12);
const strangerProfile = id(13);
const parent = id(21);
const foreignParent = id(22);
const privateParent = id(23);

test('subportals enforce ownership and preserve independent Portal visibility after a fresh rebuild', { skip: !pgliteModulePath }, async (t) => {
  const { db } = await replaySupabaseSchema();
  t.after(() => db.close());
  await db.exec(`
    insert into auth.users (id) values ('${owner}'), ('${follower}'), ('${stranger}');
    insert into auth.sessions (id, user_id) values ('${id(91)}', '${owner}'), ('${id(92)}', '${follower}'), ('${id(93)}', '${stranger}');
    insert into public.profiles (id, account_id, name, handle, is_private) values
      ('${ownerProfile}', '${owner}', 'Owner', 'nestedowner', false),
      ('${followerProfile}', '${follower}', 'Follower', 'nestedfollower', true),
      ('${strangerProfile}', '${stranger}', 'Stranger', 'nestedstranger', false);
    insert into public.portfolio_categories (id, profile_id, label, position) values
      ('${parent}', '${ownerProfile}', 'Parent', 4),
      ('${foreignParent}', '${strangerProfile}', 'Foreign', 5),
      ('${privateParent}', '${followerProfile}', 'Private parent', 2);
    insert into public.profile_follows (follower_account_id, follower_profile_id, target_profile_id, status)
    values ('${owner}', '${ownerProfile}', '${followerProfile}', 'following');
  `);

  const as = async (role, account = null, session = null) => {
    await db.exec(`reset role; set role ${role}`);
    const claims = account ? { role, sub: account, session_id: session } : {};
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  };
  const create = async (profileId, parentId, label, icon = null, format = null, blurb = null) => (
    await db.query(
      'select * from public.create_sub_portal($1::uuid, $2::uuid, $3, $4, $5, $6)',
      [profileId, parentId, label, icon, format, blurb],
    )
  ).rows[0];
  const links = async (profileId) => (await db.query(
    'select child_category_id, parent_category_id from public.portal_hierarchy where profile_id = $1 order by child_category_id',
    [profileId],
  )).rows;
  const remove = (categoryId) => db.query('delete from public.portfolio_categories where id = $1', [categoryId]);
  const categoryVisible = async (categoryId) => (await db.query(
    'select id from public.portfolio_categories where id = $1', [categoryId],
  )).rows.length === 1;

  await as('anon');
  await assert.rejects(create(ownerProfile, parent, 'Rejected'), { code: '42501' });
  await as('authenticated', stranger, id(93));
  await assert.rejects(create(ownerProfile, parent, 'Rejected'), { code: '42501' });
  await as('authenticated', owner, id(99));
  await assert.rejects(create(ownerProfile, parent, 'Revoked'), { code: '42501' });

  await as('authenticated', owner, id(91));
  await assert.rejects(create(ownerProfile, foreignParent, 'Cross-account'), { code: '22023' });
  await assert.rejects(create(ownerProfile, id(999), 'Missing'), { code: '22023' });
  await assert.rejects(create(ownerProfile, parent, 'Parent'), { code: '23505' });
  await assert.rejects(create(ownerProfile, parent, 'Invalid format', 'FolderIcon', 'bogus'), { code: '23514' });

  const child = await create(ownerProfile, parent, ' Child ', 'CameraIcon', 'gallery', ' photos ');
  assert.equal(child.profile_id, ownerProfile);
  assert.equal(child.label, 'Child');
  assert.equal(child.icon_name, 'CameraIcon');
  assert.equal(child.format, 'gallery');
  assert.equal(child.blurb, 'photos');
  assert.equal(child.position, 5);
  const grandchild = await create(ownerProfile, child.id, 'Grandchild');
  const greatGrandchild = await create(ownerProfile, grandchild.id, 'Great-grandchild');
  assert.equal(greatGrandchild.position, 7);
  assert.deepEqual(await links(ownerProfile), [
    { child_category_id: child.id, parent_category_id: parent },
    { child_category_id: grandchild.id, parent_category_id: child.id },
    { child_category_id: greatGrandchild.id, parent_category_id: grandchild.id },
  ].sort((a, b) => a.child_category_id.localeCompare(b.child_category_id)));
  await assert.rejects(db.query('update public.portal_hierarchy set parent_category_id = $1 where child_category_id = $2', [greatGrandchild.id, child.id]), { code: '42501' });
  await assert.rejects(db.query('insert into public.portal_hierarchy values ($1, $2, $3)', [ownerProfile, parent, child.id]), { code: '42501' });
  await assert.rejects(remove(parent), { code: '23503' });
  assert.ok(await categoryVisible(parent), 'parent deletion must roll back when a child exists');

  await as('authenticated', follower, id(92));
  const privateChild = await create(followerProfile, privateParent, 'Private child');
  await as('anon');
  assert.equal((await links(ownerProfile)).length, 3);
  assert.deepEqual(await links(followerProfile), []);
  await as('authenticated', owner, id(91));
  assert.deepEqual(await links(followerProfile), [{ child_category_id: privateChild.id, parent_category_id: privateParent }], 'approved followers retain existing private Portal visibility');

  await db.query('update public.portfolio_categories set is_hidden = true where id = $1', [child.id]);
  assert.equal((await links(ownerProfile)).length, 3);
  await as('anon');
  assert.deepEqual(await links(ownerProfile), [{ child_category_id: greatGrandchild.id, parent_category_id: grandchild.id }]);
  assert.equal(await categoryVisible(child.id), false);
  assert.equal(await categoryVisible(grandchild.id), true, 'nesting does not inherit the visibility of a hidden parent');

  await as('authenticated', owner, id(91));
  await assert.rejects(remove(child.id), { code: '23503' });
  await remove(greatGrandchild.id);
  await remove(grandchild.id);
  await remove(child.id);
  await remove(parent);
  assert.deepEqual(await links(ownerProfile), []);

  await db.exec('reset role');
  await assert.rejects(db.query('insert into public.portal_hierarchy values ($1, $2, $3)', [followerProfile, privateParent, foreignParent]), { code: '23503' });
  await assert.rejects(db.query('insert into public.portal_hierarchy values ($1, $2, $2)', [strangerProfile, foreignParent]), { code: '23514' });
  await as('authenticated', follower, id(92));
  await db.query('delete from public.profiles where id = $1', [followerProfile]);
  assert.deepEqual(await links(followerProfile), [], 'whole-profile deletion cascades its categories and hierarchy');
});
