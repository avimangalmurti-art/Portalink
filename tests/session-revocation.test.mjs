import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const { createSessionRevocationObserver } = sourceModule('src/services/supabase/sessionRevocation.ts', {}, { Headers, Request, AbortSignal });
function harness(fetch) {
  const state = { token: 'session-a', revoked: [] };
  const observer = createSessionRevocationObserver({ fetch, endpoint: 'https://fixture.supabase.co/rest/v1/rpc/require_active_account_session', publishableKey: 'fixture-key', currentToken: () => state.token, onRevoked: token => state.revoked.push(token) });
  return { state, observer };
}
test('explicit revoked-session response clears only the matching identity and preserves the caller response', async () => {
  const h = harness(async () => Response.json({ code: 'PT401' }, { status: 401 }));
  const result = await h.observer.fetch('https://fixture.supabase.co/rest/v1/profiles', { headers: { authorization: 'Bearer session-a' } });
  assert.deepEqual(await result.json(), { code: 'PT401' });
  assert.deepEqual(h.state.revoked, ['session-a']);
});
test('late rejection of an old token cannot sign out a replacement account/session', async () => {
  let resolve;
  const h = harness(() => new Promise(done => { resolve = done; }));
  const request = h.observer.check(); h.state.token = 'session-b';
  resolve(Response.json({ code: 'PT401' }, { status: 401 })); await request;
  assert.deepEqual(h.state.revoked, []);
});
test('network failures, missing migration, normal unauthorized and server failures preserve identity', async () => {
  for (const response of [Response.json({ code: '42501' }, { status: 401 }), new Response(null, { status: 404 }), new Response(null, { status: 500 }), new Response('invalid', { status: 401 })]) {
    const h = harness(async () => response); await h.observer.check(); assert.deepEqual(h.state.revoked, []);
  }
  const h = harness(async () => { throw new Error('offline'); }); await h.observer.check(); assert.deepEqual(h.state.revoked, []);
});
test('foreground checks are single-flight, skip guests and send no credentials in URLs', async () => {
  let resolve; const calls = [];
  const h = harness((url, init) => { calls.push({ url, init }); return new Promise(done => { resolve = done; }); });
  const checking = h.observer.check(); await h.observer.check(); assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.authorization, 'Bearer session-a');
  assert.equal(calls[0].init.headers.apikey, 'fixture-key'); assert.equal(calls[0].init.body, '{}');
  assert.ok(!calls[0].url.includes('session-a'));
  resolve(new Response(null, { status: 204 })); await checking;
  h.state.token = null; await h.observer.check(); assert.equal(calls.length, 1);
});

test('actual production client wiring clears channels and uses only local logout after denial; replacement login cancels stale logout', async () => {
  const callbacks = [], timers = [], calls = [], broadcasts = [], events = {};
  let options;
  const client = { removeAllChannels: async () => calls.push('channels'), auth: {
    onAuthStateChange(callback) { callbacks.push(callback); },
    signOut: async ({scope}) => { calls.push(scope); return {error:null}; },
  }};
  const exports = {};
  const source = readFileSync(new URL('../src/services/supabase/client.ts',import.meta.url),'utf8')
    .replaceAll('import.meta.env', 'fixtureEnv');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, URL, URLSearchParams, Headers, Request, AbortSignal,
    BroadcastChannel:class {constructor(){broadcasts.push(this);}postMessage(value){this.message=value;}close(){}},
    fixtureEnv:{VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'synthetic-publishable-key-long-enough',VITE_RUNTIME_MODE:'production',PROD:true},
    document:{visibilityState:'visible',addEventListener:(name,callback)=>{events[name]=callback;}},
    window:{location:{hash:'',reload:()=>calls.push('reload')},sessionStorage:null,setTimeout:callback=>timers.push(callback),setInterval:callback=>{events.interval=callback;},addEventListener:(name,callback)=>{events[name]=callback;}},
    require(name) {
      if(name==='../../features/auth/scopedSessionCleanup')return{revokeIssuedSession:async(host,key,token)=>{
        assert.equal(host,'https://fixture.supabase.co');assert.equal(key,'synthetic-publishable-key-long-enough');assert.equal(token,'failed-callback-token');calls.push('exact-issued-cleanup');return true;
      }};
      if(name==='@supabase/supabase-js')return{createClient:(_url,_key,value)=>{options=value;return client;}};
      if(name==='./callbackSession')return{sessionId:token=>token==='failed-callback-token'?'failed-id':token,createCallbackSessionStorage:()=>({storage:{},removeIssued:async token=>{assert.equal(token,'failed-callback-token');calls.push('conditional-storage-cleanup');return true;}})};
      if(name==='./passwordRecovery')return{createPasswordRecoveryTracker:()=>({record(){},clear(){}})};
      if(name==='../../features/performance/rum')return{rumSupabaseFetch:async()=>Response.json({code:'PT401'},{status:401})};
      if(name==='./sessionRevocation')return{createSessionRevocationObserver};
      assert.fail(`Unexpected import ${name}`);
    },
  });
  const emit=token=>callbacks.forEach(callback=>callback('SIGNED_IN',{access_token:token}));
  emit('old');
  await options.global.fetch('https://fixture.supabase.co/rest/v1/profiles',{headers:{authorization:'Bearer old'}});
  emit('replacement'); timers.shift()(); assert.deepEqual(calls,[]);
  assert.equal(await exports.cleanupIssuedAuthSession('failed-callback-token'),true);
  assert.deepEqual(calls,['exact-issued-cleanup','conditional-storage-cleanup'],'Callback cleanup uses its explicit token, without shared signOut or channel removal.');calls.length=0;
  await options.global.fetch('https://fixture.supabase.co/rest/v1/profiles',{headers:{authorization:'Bearer replacement'}});
  emit('replacement'); // SDK metadata events for the revoked token do not cancel logout.
  timers.shift()(); assert.deepEqual(calls,['channels','local']);
  const listener=broadcasts[0];assert.equal(broadcasts[1].message.sessionId,'failed-id');
  calls.length=0;listener.onmessage({data:{sessionId:'failed-id'}});assert.deepEqual(calls,[]);
  emit('failed-callback-token');listener.onmessage({data:{sessionId:'failed-id'}});assert.deepEqual(calls,['reload']);
  calls.length=0;emit('newer');listener.onmessage({data:{sessionId:'failed-id'}});assert.deepEqual(calls,[]);
  assert.equal(typeof events.focus,'function'); assert.equal(typeof events.visibilitychange,'function'); assert.equal(typeof events.interval,'function');
});
