import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/server/health.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Response, AbortSignal });
const config = { supabaseUrl: 'https://example.supabase.co', publishableKey: 'public-test-key' };
const id = '9ae4b24a-446d-41b8-b3a9-1a035ed14fc7';
test('health checks real anonymous citation resolution, without leaking its payload', async () => {
  const response = await exports.handleHealth(new Request('https://example.com/healthz'), config, async (url, options) => {
    assert.equal(url, `${config.supabaseUrl}/rest/v1/rpc/resolve_citation_item`);
    assert.deepEqual(JSON.parse(options.body), { p_item_id: id, p_require_citable: false });
    assert.equal(options.headers.apikey, config.publishableKey);
    return Response.json({ id, creator: 'Private response detail' });
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('health fails closed for missing item, malformed responses, upstream errors and timeouts', async () => {
  for (const fetcher of [async () => Response.json(null), async () => Response.json({ id: 'wrong' }), async () => new Response('secret', { status: 500 }), async () => { throw new Error('credentials'); }]) {
    const result = await exports.handleHealth(new Request('https://example.com/healthz'), config, fetcher);
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { status: 'unavailable' });
  }
});
