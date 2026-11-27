import assert from 'node:assert/strict';
import test from 'node:test';
import { pgliteModulePath, replaySupabaseSchema } from './support/replay-supabase-schema.mjs';

test('a fresh database replays the Git migrations and preserves access boundaries', { skip: !pgliteModulePath }, async t => {
  const { db, files } = await replaySupabaseSchema();
  try {
    t.diagnostic(`Applied ${files.length} numbered migrations in order`);

    const { rows: exposedTables } = await db.query(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    `);
    assert.deepEqual(exposedTables, [], 'Every public table keeps row level security');

    const { rows: [timeline] } = await db.query(`
      select
        to_regclass('public.external_references') is not null as external_references,
        exists (
          select 1 from pg_policies where schemaname = 'public'
            and tablename = 'profile_timeline_pairs' and policyname = 'timeline_pairs_edit'
        ) as pair_edit_policy,
        has_function_privilege('authenticated', 'public.save_timeline_pair_order(uuid,text[])', 'EXECUTE') as signed_in_order,
        has_function_privilege('anon', 'public.save_timeline_pair_order(uuid,text[])', 'EXECUTE') as anonymous_order
    `);
    assert.deepEqual(timeline, {
      external_references: true, pair_edit_policy: true, signed_in_order: true, anonymous_order: false,
    });

    const { rows: privateWorkerFunctions } = await db.query(`
      select p.proname as name,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as signed_in
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname ~ '^(claim|complete|fail|heartbeat)_(pdf|video)_processing'
    `);
    assert.ok(privateWorkerFunctions.some(row => row.name === 'claim_pdf_processing_job_v2'));
    assert.ok(privateWorkerFunctions.some(row => row.name === 'claim_video_processing_job'));
    assert.deepEqual(privateWorkerFunctions.filter(row => row.anonymous || row.signed_in), []);

    const { rows: buckets } = await db.query(`
      select id, public from storage.buckets where id in ('profile-audio', 'project-covers') order by id
    `);
    assert.deepEqual(buckets, [{ id: 'profile-audio', public: false }, { id: 'project-covers', public: true }]);

    const account = '00000000-0000-4000-8000-000000000001';
    const profile = '00000000-0000-4000-8000-000000000002';
    const session = '00000000-0000-4000-8000-000000000003';
    await db.query('insert into auth.users (id, email) values ($1, $2)', [account, 'schema@example.test']);
    await db.query('insert into auth.sessions (id, user_id) values ($1, $2)', [session, account]);
    await db.query("insert into public.profiles (id, account_id, name, handle) values ($1, $2, 'Creator', 'creator')", [profile, account]);
    await db.query(`insert into public.profile_audio_tracks (profile_id, title, audio_path)
      values ($1, 'Track', $2)`, [profile, `${profile}/${session}/audio.mp3`]);

    await db.exec('set role anon');
    const getBundle = async () => (await db.query('select public.shared_profile_bundle($1) as bundle', [profile])).rows[0].bundle;
    const bundle = await getBundle();
    assert.equal(bundle.profile.show_journey, true, 'The later citations default survives the earlier Journey migration');
    assert.equal(bundle.profile.contact_email_public, false, 'Employer preferences survive the public bundle replacement');
    assert.deepEqual(bundle.citations, []);
    assert.equal((await db.query('select title from public.profile_audio_tracks')).rows[0].title, 'Track');
    await assert.rejects(db.query('select * from public.profile_handle_state'), { code: '42501' });

    await db.exec('reset role');
    await db.query("update public.profiles set is_private = true where id = $1", [profile]);
    await db.exec('set role anon');
    assert.equal(await getBundle(), null);
    assert.deepEqual((await db.query('select title from public.profile_audio_tracks')).rows, []);

    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'authenticated', sub: account, session_id: session })]);
    await db.exec('set role authenticated');
    await db.query('select public.require_active_account_session()');
    assert.equal((await db.query('select title from public.profile_audio_tracks')).rows[0].title, 'Track');
    await db.exec('reset role');
    await db.query('delete from auth.sessions where id = $1', [session]);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select public.require_active_account_session()'), { code: 'PT401' });
  } finally {
    await db.close();
  }
});
