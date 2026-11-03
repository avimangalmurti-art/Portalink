import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ids, payload, request, loadModule } from './helpers/reach-fixture.mjs';

const NOW = Date.parse('2026-11-02T01:00:00Z');
const uuid = value => `60000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const iso = offset => new Date(NOW + offset).toISOString();
const snapshot = note => ({ id: note.id, revision: note.timestamp });
const plain = value => JSON.parse(JSON.stringify(value));
function setup(t) {
  const f = fixture(); let now = NOW;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const api = loadModule('src/server/projectReach.ts', { Date: Clock });
  t.after(() => f.sqlite.close());
  const call = (path, body, account = ids.owner, db = f.db) => api.handleReachRead(request(path, body, account), db, f.config);
  return { ...f, api, call, setNow(value) { now = value; },
    async notes(account = ids.owner) { const response = await call('/api/reach/notifications', undefined, account); assert.equal(response.status, 200); return response.json(); },
    async dismiss(notifications, account = ids.owner) { const response = await call('/api/reach/dismiss', { notifications }, account); assert.equal(response.status, 200); return response.json(); },
  };
}
function action(f, number, changes = {}) {
  const row = { id: uuid(number), owner: ids.owner, actor: uuid(number + 100), page: 0, kind: 'save', at: iso(-3600000), ...changes };
  f.sqlite.prepare(`INSERT INTO project_page_actions(id,owner_account_id,actor_account_id,actor_profile_id,actor_name,project_id,attachment_id,page_index,kind,at,project_title,target_path)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(row.id, row.owner, row.actor, row.actor, 'Fictional reader', ids.project, ids.attachment, row.page, row.kind, row.at, 'Design study', `/insights?project=${ids.project}`);
  return row;
}
function weekly(f, at = iso(-1800000)) {
  f.sqlite.prepare('INSERT INTO project_weekly_notes(owner_account_id,project_id,week_key,at,opened,finished) VALUES(?,?,?,?,?,?)')
    .run(ids.owner, ids.project, '2026-11-01', at, 8, 3);
}
function protectedRows(f) {
  return Object.fromEntries(['project_page_actions', 'project_weekly_notes', 'project_reach_events', 'project_reach_daily', 'media_engagements', 'media_comments']
    .map(table => [table, plain(f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())]));
}

test('selected page and weekly snapshots disappear persistently without changing analytics, saves, or comments', async t => {
  const f = setup(t), first = action(f, 1), second = action(f, 2, { at: iso(-3000000) });
  action(f, 3, { kind: 'comment', at: iso(-2000000) }); weekly(f);
  for (const row of [first, second]) f.sqlite.prepare('INSERT INTO media_engagements(account_id,project_id,attachment_id,page_index,kind) VALUES(?,?,?,?,?)')
    .run(row.actor, ids.project, ids.attachment, 0, 'save');
  f.sqlite.prepare('INSERT INTO media_comments(id,account_id,project_id,attachment_id,page_index,author_name,body) VALUES(?,?,?,?,?,?,?)')
    .run(uuid(99), ids.other, ids.project, ids.attachment, 0, 'Reader', 'A retained comment');
  assert.equal((await f.api.ingestReach(request('/api/reach', payload()), f.db, f.config, { now: () => NOW, random: () => .5 })).status, 204);
  const before = protectedRows(f), notes = await f.notes(); assert.equal(notes.length, 3);
  const selected = notes.filter(note => note.id.startsWith('d1:week:') || note.id === `d1:page:${first.id}`).map(snapshot);
  assert.deepEqual(await f.dismiss(selected), { dismissed: selected });
  assert.deepEqual((await f.notes()).map(note => note.id), [`d1:page:${uuid(3)}`]);
  assert.deepEqual(protectedRows(f), before);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM project_notification_reads WHERE id LIKE 'd1:dismiss:%'").get().n, 3);
  assert.deepEqual(await f.dismiss(selected), { dismissed: selected }, 'A repeated request is idempotent.');
  assert.equal((await f.notes()).length, 1, 'A fresh read still excludes the selected updates.');
  f.sqlite.prepare("DELETE FROM media_engagements WHERE account_id=? AND kind='save'").run(first.actor);
  assert.deepEqual((await f.notes()).map(note => note.id), [`d1:page:${uuid(3)}`], 'Revoking the first group member does not revive its dismissed remaining member.');
});

test('a stale selected group dismisses only its represented revisions and later coalesced activity stays visible', async t => {
  const f = setup(t), first = action(f, 10), initial = (await f.notes())[0];
  const later = action(f, 11, { at: iso(-1000000) });
  assert.deepEqual(await f.dismiss([snapshot(initial)]), { dismissed: [snapshot(initial)] });
  let remaining = await f.notes(); assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, `d1:page:${later.id}`); assert.equal(remaining[0].timestamp, later.at);
  assert.equal(remaining[0].isUnread, true);
  await f.call('/api/reach/read', snapshot(remaining[0]));
  remaining = await f.notes(); assert.equal(remaining[0].isUnread, false, 'Read acknowledgements use the same filtered grouping.');
  f.sqlite.prepare('DELETE FROM project_page_actions WHERE id=?').run(later.id);
  assert.deepEqual(await f.notes(), [], 'Removing the newer representative cannot resurrect the dismissed older action.');
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_page_actions WHERE id=?').get(first.id).n, 1);
});

test('revision markers do not hide a later unsave and resave with the same deterministic action ID', async t => {
  const f = setup(t), row = action(f, 20), old = snapshot((await f.notes())[0]);
  f.sqlite.prepare('INSERT INTO media_engagements(account_id,project_id,attachment_id,page_index,kind) VALUES(?,?,?,?,?)')
    .run(row.actor, ids.project, ids.attachment, 0, 'save');
  await f.dismiss([old]);
  f.sqlite.prepare("DELETE FROM media_engagements WHERE account_id=? AND kind='save'").run(row.actor);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_page_actions').get().n, 0, 'The existing revoke trigger remains active.');
  action(f, 20, { at: iso(-500000) });
  const current = (await f.notes())[0]; assert.equal(current.id, old.id); assert.notEqual(current.timestamp, old.revision);
  assert.deepEqual(await f.dismiss([old]), { dismissed: [] }, 'An old request cannot acknowledge the newer action revision.');
  assert.equal((await f.notes())[0].timestamp, current.timestamp);
  await f.dismiss([snapshot(current)]); assert.deepEqual(await f.notes(), []);
});

test('separate comments sharing a timestamp remain independent selected notifications', async t => {
  const f = setup(t); action(f, 30, { kind: 'comment' }); action(f, 31, { kind: 'comment' });
  const notes = await f.notes(), selected = notes.find(note => note.id === `d1:page:${uuid(30)}`);
  await f.dismiss([snapshot(selected)]);
  assert.deepEqual((await f.notes()).map(note => note.id), [`d1:page:${uuid(31)}`]);
});

test('weekly retries cannot recreate dismissed notes and other revisions are not claimed as dismissed', async t => {
  const f = setup(t); weekly(f); const note = (await f.notes())[0];
  await f.dismiss([snapshot(note)]);
  assert.equal((await f.call('/api/reach/weekly', { week: '2026-11-01' })).status, 200);
  assert.deepEqual(await f.notes(), []); assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_weekly_notes').get().n, 1);
  assert.deepEqual(await f.dismiss([{ id: note.id, revision: iso(-1) }]), { dismissed: [] });
});

test('authentication and account scope prevent another account from changing an owner inbox', async t => {
  const f = setup(t); action(f, 40); weekly(f); const notes = await f.notes(), before = protectedRows(f);
  const denied = await f.api.handleReachRead(request('/api/reach/dismiss', { notifications: notes.map(snapshot) }), f.db, f.config);
  assert.equal(denied.status, 401);
  await f.dismiss(notes.map(snapshot), ids.other);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_notification_reads').get().n, 0);
  assert.deepEqual(await f.notes(), notes); assert.deepEqual(protectedRows(f), before);
  assert.equal((await f.api.handleReachRead(request('/api/reach/dismiss', { notifications: notes.map(snapshot) }, ids.owner), undefined, f.config)).status, 503);
});

test('bounded batches dismiss all 100 shown snapshots while older unselected entries remain available', async t => {
  const f = setup(t);
  for (let index = 0; index < 101; index++) action(f, index + 1000, { kind: 'comment', at: iso(-1000 - index) });
  const entries = (await f.notes()).map(snapshot); assert.equal(entries.length, 100);
  assert.ok(JSON.stringify({ notifications: entries }).length > 1024);
  assert.deepEqual(await f.dismiss(entries), { dismissed: entries });
  assert.deepEqual((await f.notes()).map(note => note.id), [`d1:page:${uuid(1100)}`]);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_page_actions').get().n, 101);
  assert.deepEqual(await f.dismiss([{ id: `d1:page:${uuid(9999)}`, revision: iso(-1) }]),
    { dismissed: [{ id: `d1:page:${uuid(9999)}`, revision: iso(-1) }] }, 'Absent snapshots are idempotent without creating markers.');
  for (const body of [{ notifications: [] }, { notifications: [...entries, entries[0]] }, { notifications: [entries[0]], owner: ids.other },
    { notifications: [{ ...entries[0], extra: true }] }, { notifications: [{ ...entries[0], revision: 'not-a-date' }] },
    { notifications: [{ id: 'd1:dismiss:all', revision: iso(0) }] }, { notifications: [{ id: `d1:page:${'-'.repeat(36)}`, revision: iso(0) }] }]) {
    assert.equal((await f.call('/api/reach/dismiss', body)).status, 400);
  }
  assert.equal((await f.call('/api/reach/dismiss', { notifications: [{ ...entries[0], revision: 'x'.repeat(17000) }] })).status, 413);
  assert.equal((await f.call('/api/reach/dismiss')).status, 404);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_notification_reads').get().n, 100);
});

test('a failed transactional batch does not report success or leave partial dismissals', async t => {
  const f = setup(t); action(f, 50, { kind: 'comment' }); action(f, 51, { kind: 'comment' }); const notes = await f.notes();
  const failing = { ...f.db, batch: statements => f.db.batch([statements[0], { async run() { throw new Error('Fictional failure'); } }]) };
  const response = await f.call('/api/reach/dismiss', { notifications: notes.map(snapshot) }, ids.owner, failing);
  assert.equal(response.status, 503); assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_notification_reads').get().n, 0);
  assert.deepEqual(await f.notes(), notes);
});

test('retention pruning of old dismissal markers cannot restore activity outside the inbox window', async t => {
  const f = setup(t); action(f, 60); weekly(f); await f.dismiss((await f.notes()).map(snapshot));
  const future = NOW + 31 * 86400000; f.setNow(future);
  await f.api.ingestReach(request('/api/reach', payload()), f.db, f.config, { now: () => future, random: () => 0 });
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_notification_reads').get().n, 0);
  assert.deepEqual(await f.notes(), []);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM project_page_actions').get().n, 1, 'Historical action analytics remain stored.');
});
