import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/server/rum.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Request, Response, TextDecoder, URL, crypto: globalThis.crypto });
const { validateRumPayload, handleRumIngest, nearestRank, readRumSummary, RUM_SUMMARY_SQL } = exports;
const sample = () => ({
  route_kind: 'share', boot_ms: 18, data_ms: 187, cover_ms: 325, pdf_ms: null,
  vw_bucket: '400-639', conn: '4g', version: '0a3764d',
});
const request = (payload = sample(), headers = {}) => new Request('https://portalink.example/api/rum', {
  method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json', ...headers },
});
const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const options = { now: () => NOW, random: () => 0.5, uuid: () => 'synthetic-beacon-id' };
const plain = value => JSON.parse(JSON.stringify(value));

function database({ rows = [], fail = false, failRetention = false } = {}) {
  const calls = [];
  const db = {
    prepare(sql) {
      const call = { sql, values: [] };
      return {
        bind(...values) { call.values = values; return this; },
        async run() {
          calls.push(call);
          if (fail || (failRetention && sql.startsWith('DELETE'))) throw new Error('D1 SQL details must stay private');
        },
        async all() {
          calls.push(call);
          if (fail) throw new Error('no such table: page_timings');
          return { results: rows };
        },
      };
    },
  };
  return { db, calls };
}

test('RUM accepts only the exact anonymous, low-cardinality schema', () => {
  assert.deepEqual(plain(validateRumPayload(sample())), sample());
  assert.ok(validateRumPayload({ ...sample(), pdf_ms: 0, cover_ms: 86_400_000 }));
  for (const key of ['profile_id', 'account_id', 'path', 'ip', 'user_agent', 'extra']) {
    assert.equal(validateRumPayload({ ...sample(), [key]: 'secret' }), null, key);
  }
  for (const key of Object.keys(sample())) {
    const incomplete = sample(); delete incomplete[key];
    assert.equal(validateRumPayload(incomplete), null, key);
  }
  for (const value of [null, [], 'text', 1]) assert.equal(validateRumPayload(value), null);
});

test('RUM rejects durations and dimensions outside the enumerated ranges', () => {
  for (const metric of ['boot_ms', 'data_ms', 'cover_ms', 'pdf_ms']) {
    for (const value of [-1, 86_400_001, NaN, Infinity, '12', undefined, {}, false]) {
      assert.equal(validateRumPayload({ ...sample(), [metric]: value }), null, `${metric}:${value}`);
    }
    assert.ok(validateRumPayload({ ...sample(), [metric]: null }));
  }
  for (const route_kind of ['/share/profile-id', 'settings', '', null]) assert.equal(validateRumPayload({ ...sample(), route_kind }), null);
  for (const vw_bucket of ['420', 420, 'mobile', null]) assert.equal(validateRumPayload({ ...sample(), vw_bucket }), null);
  for (const conn of ['wifi', 'User agent', null]) assert.equal(validateRumPayload({ ...sample(), conn }), null);
  for (const version of ['main', 'a'.repeat(65), '123456', 'AB34567', '1234567\n']) assert.equal(validateRumPayload({ ...sample(), version }), null);
});

test('ingest bounds actual UTF-8 body bytes even if content-length is absent or false', async () => {
  const { db, calls } = database();
  const oversized = { ...sample(), extra: '😀'.repeat(300) };
  for (const headers of [{}, { 'content-length': '1' }]) {
    const response = await handleRumIngest(request(oversized, headers), db, options);
    assert.equal(response.status, 413);
  }
  assert.equal((await handleRumIngest(request(sample(), { 'content-length': '1025' }), db, options)).status, 413);
  const encoded = new TextEncoder().encode(JSON.stringify(oversized));
  let canceled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(encoded.subarray(0, 600)); controller.enqueue(encoded.subarray(600)); },
    cancel() { canceled = true; },
  });
  const streamed = new Request('https://portalink.example/api/rum', { method: 'POST', body, duplex: 'half' });
  assert.equal((await handleRumIngest(streamed, db, options)).status, 413);
  assert.equal(canceled, true);
  assert.equal(calls.length, 0);
});

test('invalid JSON, extra keys, cross-origin submissions, and wrong methods never write', async () => {
  const { db, calls } = database();
  assert.equal((await handleRumIngest(new Request('https://portalink.example/api/rum', { method: 'POST', body: '{' }), db, options)).status, 400);
  assert.equal((await handleRumIngest(request({ ...sample(), account_id: 'do-not-save' }), db, options)).status, 400);
  assert.equal((await handleRumIngest(request(sample(), { origin: 'https://unrelated.example' }), db, options)).status, 403);
  assert.equal((await handleRumIngest(new Request('https://portalink.example/api/rum'), db, options)).status, 405);
  assert.equal(calls.length, 0);
});

test('valid beacon writes exactly the approved fields and no request identity', async () => {
  const { db, calls } = database();
  const response = await handleRumIngest(request(sample(), {
    origin: 'https://portalink.example', authorization: 'Bearer private-session',
    'user-agent': 'Private phone', 'cf-connecting-ip': '192.0.2.1', referer: 'https://portalink.example/share/private-id',
  }), db, options);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 1);
  assert.deepEqual(plain(calls[0].values), [
    'synthetic-beacon-id', '2026-09-30T12:00:00.000Z', 'share', 18, 187, 325, null, '400-639', '4g', '0a3764d',
  ]);
  assert.match(calls[0].sql, /INSERT INTO page_timings/);
});

test('one in a hundred accepted requests removes only timings older than thirty days', async () => {
  const { db, calls } = database();
  assert.equal((await handleRumIngest(request(), db, { ...options, random: () => 0.00999 })).status, 204);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].sql, 'DELETE FROM page_timings WHERE at < ?');
  assert.deepEqual(plain(calls[1].values), ['2026-08-31T12:00:00.000Z']);
  const unsampled = database();
  await handleRumIngest(request(), unsampled.db, { ...options, random: () => 0.01 });
  assert.equal(unsampled.calls.length, 1);
  const retentionFailure = database({ failRetention: true });
  assert.equal((await handleRumIngest(request(), retentionFailure.db, { ...options, random: () => 0 })).status, 204);
});

test('missing D1 or unapplied schema fails closed without runtime schema creation or SQL details', async () => {
  const missing = await handleRumIngest(request(), undefined, options);
  assert.equal(missing.status, 503);
  const { db, calls } = database({ fail: true });
  const response = await handleRumIngest(request(), db, options);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Load timings are not available yet.' });
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0].sql, /CREATE|ALTER/);
  assert.equal((await readRumSummary(db, options)).status, 503);
});

test('nearest-rank percentiles handle empty, odd, even, repeated, and unsorted samples', () => {
  assert.equal(nearestRank([], 0.5), null);
  assert.equal(nearestRank([42], 0.9), 42);
  assert.equal(nearestRank([90, 10, 50], 0.5), 50);
  assert.equal(nearestRank([90, 10, 50, 20], 0.5), 20);
  assert.equal(nearestRank([90, 10, 50, 20], 0.9), 90);
  assert.equal(nearestRank([1, 1, 1, 9], 0.5), 1);
  const source = [100, 0, 200];
  nearestRank(source, 0.5);
  assert.deepEqual(source, [100, 0, 200]);
  for (let count = 1; count <= 100; count += 1) {
    for (const percentile of [50, 90]) {
      const sqlIntegerRank = Math.floor((count * percentile + 99) / 100);
      assert.equal(sqlIntegerRank, Math.ceil(count * percentile / 100));
    }
  }
});

test('summary uses bounded D1 window aggregates and fills unavailable metric samples with null', async () => {
  const { db, calls } = database({ rows: [
    { period: '24h', route_kind: 'share', metric: 'cover_ms', count: 4, p50: 200, p90: 900 },
    { period: '7d', route_kind: 'share', metric: 'cover_ms', count: 10, p50: 325, p90: 1_000 },
  ] });
  const response = await readRumSummary(db, options);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.percentile_method, 'nearest-rank');
  assert.equal(result.windows.length, 2);
  assert.deepEqual(result.windows.map(window => window.period), ['24h', '7d']);
  assert.deepEqual(result.windows[0].rows.map(row => row.route_kind), ['share', 'profile', 'project', 'home']);
  assert.deepEqual(result.windows[0].rows[0].cover_ms, { count: 4, p50: 200, p90: 900 });
  assert.deepEqual(result.windows[0].rows[0].pdf_ms, { count: 0, p50: null, p90: null });
  assert.deepEqual(result.windows[1].rows[0].cover_ms, { count: 10, p50: 325, p90: 1_000 });
  assert.equal(calls.length, 1);
  assert.deepEqual(plain(calls[0].values), ['2026-09-23T12:00:00.000Z', '2026-09-30T12:00:00.000Z', '2026-09-29T12:00:00.000Z', '2026-09-23T12:00:00.000Z']);
  assert.match(RUM_SUMMARY_SQL, /FROM page_timings WHERE at >= \? AND at <= \?/);
  assert.match(RUM_SUMMARY_SQL, /ROW_NUMBER\(\) OVER \(PARTITION BY period, route_kind, metric ORDER BY duration\)/);
  assert.match(RUM_SUMMARY_SQL, /GROUP BY period, route_kind, metric/);
  assert.doesNotMatch(RUM_SUMMARY_SQL, /account_id|profile_id|user_agent|project_id/);
});

test('actual SQLite window query matches nearest-rank math and exact time boundaries without creating a table', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  const hour = 3_600_000;
  const fixtures = [
    [NOW - hour, 'share', 10, 100, 200, null],
    [NOW - hour, 'share', 20, 300, 900, null],
    [NOW - 24 * hour, 'share', 50, null, 400, null],
    [NOW - 24 * hour - 1, 'share', 90, 500, 1_000, null],
    [NOW - 7 * 24 * hour, 'project', 25, 50, null, 750],
    [NOW - 7 * 24 * hour - 1, 'project', 9999, 9999, 9999, 9999],
    [NOW + 1, 'share', 9999, 9999, 9999, 9999],
  ];
  // A VALUES CTE supplies synthetic records to the production SELECT. This
  // executes neither the pending migration nor any CREATE/INSERT statement.
  const values = fixtures.map(row => row.map((value, index) => index === 0 ? new Date(value).toISOString() : value));
  const sql = RUM_SUMMARY_SQL.replace(/^WITH/, `WITH page_timings(at, route_kind, boot_ms, data_ms, cover_ms, pdf_ms) AS (VALUES ${fixtures.map(() => '(?, ?, ?, ?, ?, ?)').join(',')}),`);
  try {
    const rows = sqlite.prepare(sql).all(...values.flat(),
      new Date(NOW - 7 * 24 * hour).toISOString(), new Date(NOW).toISOString(),
      new Date(NOW - 24 * hour).toISOString(), new Date(NOW - 7 * 24 * hour).toISOString());
    for (const period of ['24h', '7d']) {
      for (const route_kind of ['share', 'profile', 'project', 'home']) {
        for (const [index, metric] of ['boot_ms', 'data_ms', 'cover_ms', 'pdf_ms'].entries()) {
          const cutoff = NOW - (period === '24h' ? 24 : 7 * 24) * hour;
          const samples = fixtures.filter(row => row[0] >= cutoff && row[0] <= NOW && row[1] === route_kind && row[index + 2] !== null).map(row => row[index + 2]);
          const aggregate = rows.find(row => row.period === period && row.route_kind === route_kind && row.metric === metric);
          if (!samples.length) assert.equal(aggregate, undefined);
          else {
            assert.equal(aggregate.count, samples.length);
            assert.equal(aggregate.p50, nearestRank(samples, 0.5));
            assert.equal(aggregate.p90, nearestRank(samples, 0.9));
          }
        }
      }
    }
  } finally { sqlite.close(); }
});

test('pending migration adds only anonymous timings and its time index', () => {
  const migration = readFileSync(new URL('../drizzle/0002_page_timings.sql', import.meta.url), 'utf8');
  assert.match(migration, /PREPARED ONLY/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS page_timings/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_page_timings_at ON page_timings\(at\)/);
  assert.doesNotMatch(migration, /DROP|ALTER TABLE|media_engagements|media_comments/);
});
