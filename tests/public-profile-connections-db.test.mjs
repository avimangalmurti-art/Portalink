import assert from 'node:assert/strict';
import test from 'node:test';
import { pgliteModulePath, replaySupabaseSchema } from './support/replay-supabase-schema.mjs';

const id = (number) => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const creator = id(1);
const viewer = id(2);
const privatePerson = id(3);
const pendingPerson = id(4);
const creatorProfile = id(11);
const viewerProfile = id(12);
const privateProfile = id(13);
const pendingProfile = id(14);
const viewerSession = id(20);

test('public profile connection pages retain accepted counts and authenticated privacy boundaries', { skip: !pgliteModulePath }, async (t) => {
  const { db } = await replaySupabaseSchema();
  t.after(() => db.close());

  await db.exec(`
    insert into auth.users (id) values ('${creator}'), ('${viewer}'), ('${privatePerson}'), ('${pendingPerson}');
    insert into auth.sessions (id, user_id) values ('${viewerSession}', '${viewer}');
    insert into public.profiles (id, account_id, name, handle, is_private) values
      ('${creatorProfile}', '${creator}', 'Creator', 'connectionscreator', false),
      ('${viewerProfile}', '${viewer}', 'Viewer', 'connectionsviewer', false),
      ('${privateProfile}', '${privatePerson}', 'Private person', 'connectionsprivate', true),
      ('${pendingProfile}', '${pendingPerson}', 'Pending person', 'connectionspending', false);
    insert into auth.users (id)
      select ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
      from generate_series(100, 154) n;
    insert into public.profiles (id, account_id, name, handle, avatar_url)
      select ('10000000-0000-4000-8000-' || lpad((n + 100)::text, 12, '0'))::uuid,
             ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
             'Person ' || n, 'connections' || n, case when n = 100 then 'https://example.invalid/avatar.png' else '' end
      from generate_series(100, 154) n;
    insert into public.profile_follows (follower_account_id, follower_profile_id, target_profile_id, status, created_at)
      select account_id, id, '${creatorProfile}', 'following', '2026-01-01'
      from public.profiles where handle ~ '^connections[0-9]+$';
    insert into public.profile_follows (follower_account_id, follower_profile_id, target_profile_id, status, created_at) values
      ('${privatePerson}', '${privateProfile}', '${creatorProfile}', 'following', '2026-01-02'),
      ('${pendingPerson}', '${pendingProfile}', '${creatorProfile}', 'pending', '2026-01-03'),
      ('${creator}', '${creatorProfile}', '${viewerProfile}', 'following', '2026-01-01');
  `);

  const as = async (role, claims = {}) => {
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  };
  const list = async (profileId, kind, offset = 0) => (
    await db.query('select public.public_profile_connections($1::uuid, $2::text, $3::integer) as page', [profileId, kind, offset])
  ).rows[0].page;

  await as('anon');
  await assert.rejects(list(creatorProfile, 'followers'), { code: '42501' });
  const guestCounts = await db.query('select public.profile_connection_counts($1::uuid) as counts', [creatorProfile]);
  assert.deepEqual(guestCounts.rows[0].counts, { followers: 56, following: 1 });

  await as('authenticated');
  await assert.rejects(list(creatorProfile, 'followers'), { code: '42501' });
  const jwt = { role: 'authenticated', sub: viewer, session_id: viewerSession };
  await as('authenticated', { ...jwt, is_anonymous: true });
  await assert.rejects(list(creatorProfile, 'followers'), { code: '42501' });
  await as('authenticated', { ...jwt, session_id: id(99) });
  await assert.rejects(list(creatorProfile, 'followers'), { code: '42501' });
  await as('authenticated', jwt);

  const first = await list(creatorProfile, 'followers');
  assert.equal(first.total, 56, 'accepted but undisclosable identities are retained in the aggregate');
  assert.equal(first.items.length, 53);
  assert.equal(first.nextOffset, 54);
  assert.deepEqual(first.items[0], { profileId: id(200), name: 'Person 100', avatar: 'https://example.invalid/avatar.png' });
  assert.deepEqual(first.items[1], { profileId: id(201), name: 'Person 101', avatar: '' });
  assert.equal(first.items.at(-1).profileId, id(252), 'IDs deterministically resolve timestamp ties');
  assert.ok(first.items.every((person) => person.profileId !== privateProfile && person.profileId !== pendingProfile));
  assert.deepEqual(await list(creatorProfile, 'followers', -1), first);
  assert.deepEqual(await list(creatorProfile, 'followers', 54), {
    items: [{ profileId: id(253), name: 'Person 153', avatar: '' }, { profileId: id(254), name: 'Person 154', avatar: '' }],
    total: 56, nextOffset: null,
  });
  assert.deepEqual(await list(creatorProfile, 'following'), {
    items: [{ profileId: viewerProfile, name: 'Viewer', avatar: '' }], total: 1, nextOffset: null,
  });
  assert.deepEqual(await list(creatorProfile, 'followers', 56), { items: [], total: 56, nextOffset: null });
  assert.equal(await list(privateProfile, 'following'), null);
  assert.equal(await list(id(999), 'followers'), null);
  await assert.rejects(list(creatorProfile, 'pending'), { code: '22023' });
  const raw = await db.query('select target_profile_id from public.profile_follows where target_profile_id = $1', [creatorProfile]);
  assert.deepEqual(raw.rows, [], 'using the public list never grants access to the raw follow records');
});
