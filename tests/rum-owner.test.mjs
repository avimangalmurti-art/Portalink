import { sourceModule } from './helpers/source-module.mjs';
import { publicOriginFixture, publicRedirectFixture } from './helpers/public-origin-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const OWNER_PROFILE = 'a0000000-0000-4000-8000-000000000001';
const OWNER_ACCOUNT = 'b0000000-0000-4000-8000-000000000001';
const OTHER_ACCOUNT = 'b0000000-0000-4000-8000-000000000002';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, imports = {}, globals = {}) {
  const source = read(path).replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://test.supabase.co'")
    .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', "'public-test-key'");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, {
    exports, URL, URLSearchParams, Request, Response, Headers, AbortSignal, TextDecoder, crypto,
    ...globals, require: name => { if(name.endsWith('/textFormatting'))return sourceModule('src/components/text/textFormatting.ts'); assert.ok(name in imports, `Unexpected module ${name}`); return imports[name]; },
  });
  return exports;
}

function setup() {
  const calls = [], databaseReads = [];
  const state = { ownerProfileId: OWNER_PROFILE, authFailure: null, profileFailure: null, profileRows: undefined, missingDb: false };
  const fetch = async (address, init) => {
    const url = new URL(address), headers = new Headers(init.headers);
    calls.push({ url, headers, init });
    assert.equal(url.origin, 'https://test.supabase.co');
    assert.equal(headers.get('apikey'), 'public-test-key');
    assert.equal(headers.get('cookie'), null);
    if (url.pathname === '/auth/v1/user') {
      if (state.authFailure) return state.authFailure();
      const token = headers.get('authorization');
      if (token === 'Bearer expired') return Response.json({}, { status: 401 });
      const id = token === 'Bearer owner' ? OWNER_ACCOUNT : OTHER_ACCOUNT;
      // An attacker can write this metadata. It must have no authorization effect.
      return Response.json({ id, user_metadata: { profile_id: OWNER_PROFILE, role: 'owner' } });
    }
    if (url.pathname === '/rest/v1/rpc/require_active_account_session') return new Response(null, { status: 204 });
    assert.equal(url.pathname, '/rest/v1/profiles');
    assert.equal(url.searchParams.get('select'), 'id,account_id');
    assert.equal(url.searchParams.get('id'), `eq.${OWNER_PROFILE}`);
    assert.equal(url.searchParams.get('limit'), '1');
    assert.equal(init.redirect, 'manual');
    const account = headers.get('authorization') === 'Bearer owner' ? OWNER_ACCOUNT : OTHER_ACCOUNT;
    assert.equal(url.searchParams.get('account_id'), `eq.${account}`);
    if (state.profileFailure) return state.profileFailure();
    return Response.json(state.profileRows ?? (account === OWNER_ACCOUNT ? [{ id: OWNER_PROFILE, account_id: OWNER_ACCOUNT }] : []));
  };
  const owner = load('src/server/rumOwner.ts', {}, { fetch });
  const rum = load('src/server/rum.ts');
  const worker = load('src/sites-worker.ts', {
    './features/citations/publicOrigin': publicOriginFixture,
    './server/publicOriginRedirect': publicRedirectFixture,
    './features/sharing/shareModel': load('src/features/sharing/shareModel.ts'),
    './server/shareAddress': {}, './server/referenceResolver':{},'./server/portfolioExport':{},'./server/citation': { citationLicenseResponse: () => null, handleCitation: () => { throw new Error('Unexpected citation route in non-citation fixture'); } }, './server/projectReach': {},
    './server/sharedPreview': {}, './server/publicMedia': { isPublicMediaRoute: () => false },
    './server/rumOwner': owner, './server/rum': rum,
  }, { fetch }).default;
  const db = { prepare(sql) { return {
    bind(...values) { this.values = values; return this; },
    async all() { databaseReads.push({ sql, values: this.values }); return { results: [] }; },
    async run() { assert.fail('Summary must never write D1'); },
  }; } };
  const request = (token = 'owner', method = 'GET', path = '/api/rum/summary') => worker.fetch(new Request(`https://portalink.example${path}`, {
    method, headers: { cookie: 'untrusted_session=owner', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), { DB: state.missingDb ? undefined : db, RUM_OWNER_PROFILE_ID: state.ownerProfileId,
    ASSETS: { fetch: async () => { assert.fail('RUM routes must not fall through to HTML'); } },
  });
  return { request, state, calls, databaseReads };
}

test('summary requires a verified bearer session and reads no D1 for guests or expired sessions', async () => {
  for (const token of [null, 'expired']) {
    const s = setup();
    const response = await s.request(token);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('x-portalink-rum-owner'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(s.databaseReads.length, 0);
    assert.equal(s.calls.length, token ? 1 : 0, 'A cookie alone is not an authenticated session');
  }
});

test('non-owner and self-assigned owner metadata cannot read timings', async () => {
  const s = setup();
  const response = await s.request('other');
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('x-portalink-rum-owner'), null);
  assert.equal(s.calls.length, 3, 'Verify user and active session, then its real profile/account relation under RLS');
  assert.equal(s.databaseReads.length, 0);
  assert.equal(s.calls[1].headers.get('authorization'), 'Bearer other');
});

test('only a matching configured profile and its verified account can reach the aggregate query', async () => {
  const s = setup();
  const response = await s.request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-portalink-rum-owner'), 'true');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(s.databaseReads.length, 1);
  assert.match(s.databaseReads[0].sql, /FROM page_timings/);
  assert.equal((await response.json()).windows.length, 2);
  assert.equal(s.calls[1].headers.get('authorization'), 'Bearer owner');
});

test('owner relation response is rechecked instead of trusting a query or editable metadata', async () => {
  for (const rows of [
    [], [{ id: OWNER_PROFILE, account_id: OTHER_ACCOUNT }],
    [{ id: OTHER_ACCOUNT, account_id: OWNER_ACCOUNT }],
    [{ id: OWNER_PROFILE, account_id: OWNER_ACCOUNT }, { id: OWNER_PROFILE, account_id: OWNER_ACCOUNT }],
    { id: OWNER_PROFILE, account_id: OWNER_ACCOUNT },
  ]) {
    const s = setup(); s.state.profileRows = rows;
    assert.equal((await s.request()).status, 403);
    assert.equal(s.databaseReads.length, 0);
  }
});

test('unset or malformed owner configuration fails closed before data access', async () => {
  for (const config of [undefined, '', 'not-a-profile', `${OWNER_PROFILE}/other`]) {
    const s = setup(); s.state.ownerProfileId = config;
    const response = await s.request();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-portalink-rum-owner'), null);
    assert.equal(s.calls.length, 0);
    assert.equal(s.databaseReads.length, 0);
  }
});

test('verification failures never reach D1 or identify a requester as the owner', async () => {
  for (const kind of ['authFailure', 'profileFailure']) {
    for (const failure of [() => Response.json({}, { status: 500 }), () => { throw new Error('network details'); }]) {
      const s = setup(); s.state[kind] = failure;
      const response = await s.request();
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('x-portalink-rum-owner'), null);
      assert.equal(s.databaseReads.length, 0);
      assert.doesNotMatch(await response.text(), /network details|SELECT/);
    }
  }
});

test('a confirmed owner can see a migration-pending state; invalid methods and subroutes remain closed', async () => {
  const s = setup(); s.state.missingDb = true;
  const response = await s.request();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-portalink-rum-owner'), 'true');
  assert.equal(s.databaseReads.length, 0);
  s.calls.length = 0;
  assert.equal((await s.request('owner', 'POST')).status, 405);
  assert.equal((await s.request('owner', 'GET', '/api/rum/unknown')).status, 404);
  assert.equal(s.calls.length, 0);
});

test('redirected owner lookup never follows Location or grants access to D1', async () => {
  for (const status of [302, 307]) {
    const s = setup();
    s.state.profileFailure = () => Response.json([{ id: OWNER_PROFILE, account_id: OWNER_ACCOUNT }], {
      status, headers: { location: 'https://untrusted.example/collect' },
    });
    const response = await s.request();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-portalink-rum-owner'), null);
    assert.equal(s.databaseReads.length, 0);
    assert.equal(s.calls.length, 3, 'User verification, active-session check and one profile lookup');
  }
});

function client({ session = { access_token: 'synthetic-token' }, sessionFailure = false, response = Response.json({}) } = {}) {
  const calls = [];
  const service = load('src/services/supabase/rumInsightsService.ts', {
    './client': { requireSupabase: () => ({ auth: { async getSession() {
      if (sessionFailure) throw new Error('Session lookup failed');
      return { data: { session }, error: null };
    } } }) },
  }, { fetch: async (...args) => { calls.push(args); return response; } });
  return { ...service, calls };
}

test('client hides timings before server owner confirmation, including session lookup failures', async () => {
  for (const options of [{ session: null }, { sessionFailure: true }, { response: Response.json({}, { status: 403 }) }, { response: Response.json({}, { status: 503 }) }]) {
    const s = client(options);
    assert.equal(await s.getRumInsights(), null);
  }
  const s = client({ response: Response.json({}, { status: 403 }) });
  await s.getRumInsights();
  assert.equal(s.calls[0][0], '/api/rum/summary');
  assert.equal(s.calls[0][1].headers.authorization, 'Bearer synthetic-token');
  assert.equal(s.calls[0][1].cache, 'no-store');
  assert.equal(s.calls[0][1].credentials, 'omit');
  assert.equal(s.calls[0][1].redirect, 'error');
});

test('only a server-confirmed owner receives table data or the migration-pending error', async () => {
  const summary = { percentile_method: 'nearest-rank', windows: [] };
  assert.deepEqual(await client({ response: Response.json(summary, { headers: { 'x-portalink-rum-owner': 'true' } }) }).getRumInsights(), summary);
  await assert.rejects(client({ response: Response.json({}, { status: 503, headers: { 'x-portalink-rum-owner': 'true' } }) }).getRumInsights(), /not available yet/);
});

test('Insights table is absent for guests and non-owners, and shows owner-only aggregate rows', () => {
  const empty = { count: 0, p50: null, p90: null };
  const summary = { percentile_method: 'nearest-rank', windows: [{ period: '24h', since: '', rows: [{
    route_kind: 'share', boot_ms: empty, data_ms: empty, cover_ms: { count: 5, p50: 200, p90: 800 }, pdf_ms: empty,
  }] }] };
  function render(isAuthenticated, data) {
    const { default: Component } = load('src/features/library/LoadTimingInsights.tsx', {
      react: React, '../../contexts/AuthContext': { useAuth: () => ({ isAuthenticated, session: {} }) },
      '../../services/supabase/rumInsightsService': { getRumInsights: async () => data },
      './useAccountQuery': { useAccountQuery: () => ({ data, loading: false, retry() {} }) },
    });
    return renderToStaticMarkup(React.createElement(Component));
  }
  assert.equal(render(false, summary), '');
  assert.equal(render(true, null), '');
  const owner = render(true, summary);
  assert.match(owner, /Site load timings/);
  assert.match(owner, /200 ms \/ 800 ms/);
  assert.match(owner, /5 samples/);
});
