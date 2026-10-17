import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { runDeletionTick as candidateRunDeletionTick } from '../supabase/pending/deletion-worker.mjs';
import { createD1DeletionAdapter, deletionManifestDigest } from '../supabase/pending/deletion-d1.mjs';
import { createDeletionHandler as candidateDeletionHandler } from '../supabase/pending/deletion-request.mjs';
const receipt = 'a'.repeat(64);
const receiptHash = value => createHash('sha256').update(Buffer.from(value, 'hex')).digest('hex');
// Explicit synthetic review values, never production defaults.
const successfulD1 = async manifest => ({completed:true,jobId:manifest.jobId,manifestDigest:await deletionManifestDigest(manifest)});
const runDeletionTick = (admin, options={}) => candidateRunDeletionTick(admin,{d1:successfulD1,...options});
const createDeletionHandler = (admin, options = {}) => candidateDeletionHandler(admin, { receiptLifetimeSeconds: 3600, receiptRetentionSeconds: 7200, d1:successfulD1, ...options });

function fixture(options = {}) {
  const events = [], calls = [];
  let phase = options.authPhase ? 'auth' : 'storage', absent = Boolean(options.absent);
  let lostAuth = false, lostCheckpoint = false, failedFinish = false, completed = false, lookups = 0;
  const files = options.files ?? [{ bucket: 'message-media', path: 'owner/chat/own.png' }];
  const stored = new Set(options.authPhase ? [] : Array.isArray(files) ? files.map(file => JSON.stringify(file)) : []);
  const checkpointed = new Set();
  const admin = {
    rpc: async (name, args) => {
      events.push(name); calls.push([name, args]);
      if (name === 'claim_account_deletion') return { data: completed || options.claimIdle ? null : { id: 'job', account_id: options.jobAccount ?? 'owner', lease_token: 'lease', status: 'deleting' } };
      if (name === 'account_deletion_batch') return { data: phase === 'storage' ? { phase, files } : phase==='d1' ? {phase,manifest:{version:1,jobId:'job',accountId:options.jobAccount??'owner',ownedProjectIds:[]}} : { phase } };
      if (name === 'checkpoint_account_deletion_files') {
        if (options.lostCheckpoint && !lostCheckpoint) { lostCheckpoint = true; return { error: { message: 'lost checkpoint reply' } }; }
        if (options.storageStillPresent || args.p_files.some(file => stored.has(JSON.stringify(file)))) return { error: { message: 'SQL still sees Storage objects' } };
        args.p_files.forEach(file => checkpointed.add(JSON.stringify(file)));
        if (checkpointed.size === files.length) phase = 'anonymize';
      }
      if (name === 'anonymize_account_deletion') { assert.equal(stored.size, 0); phase = 'd1'; }
      if (name === 'checkpoint_account_deletion_d1') { assert.equal(phase,'d1'); if(options.d1CheckpointError)return {error:{message:'D1 checkpoint response lost'}};phase='auth'; }
      if (name === 'finish_account_deletion') {
        assert.equal(absent, true); assert.equal(stored.size, 0); assert.equal(phase, 'auth');
        if (options.finishError && !failedFinish) { failedFinish = true; return { error: { message: 'SQL completion not confirmed' } }; }
        completed = true;
      }
      return { data: null };
    },
    storage: { from: bucket => ({ remove: async paths => {
      events.push(['remove', bucket, ...paths]); assert.ok(paths.length <= 100);
      if (options.storageError) return { error: { message: 'Storage failed' } };
      if (options.storageEmptyReply) return {};
      paths.forEach(path => stored.delete(JSON.stringify({ bucket, path })));
      return { error: null };
    } }) },
    auth: { admin: {
      getUserById: async account => {
        events.push(['lookup', account]); lookups++;
        if (options.lookupResponse) return options.lookupResponse(account, lookups);
        if (options.lookupError) return { error: options.lookupError };
        if (options.postDeleteLookupError && absent) return { error: { status: 401, code: 'bad_jwt' } };
        return absent ? { error: { status: 404, code: 'user_not_found' } } : { data: { user: { id: options.authIdentity ?? account } }, error: null };
      },
      deleteUser: async account => {
        events.push(['deleteAuth', account]);
        if (options.deleteError) return { error: options.deleteError };
        absent = true;
        if (options.lostAuth && !lostAuth) { lostAuth = true; throw Error('sensitive provider reply lost'); }
        if (options.deleteEmptyReply) return {};
        return { error: null };
      },
    } },
  };
  return { admin, events, calls, get completed() { return completed; } };
}
const request = (body, token = 'verified-token') => new Request('https://example.test', {
  method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify({ ...(body.action === 'request' ? { receipt } : {}), ...(body.action === 'prepare' ? {expectedAccountId:'owner'} : {}), ...body }),
});
function requestFixture(options = {}) {
  const f = fixture(options), rpc = f.admin.rpc;
  const timestamp = Math.floor(Date.now() / 1000);
  f.admin.supabaseUrl = 'https://project.supabase.co';
  f.claims = { sub: 'owner', iss: `${f.admin.supabaseUrl}/auth/v1`, role: 'authenticated', aud: 'authenticated', is_anonymous: false,
    session_id: '00000000-0000-4000-8000-000000000001', exp: timestamp + 3600, amr: [{ method: 'password', timestamp }] };
  f.signIn = { p_session_id: f.claims.session_id, p_authenticated_at: new Date(timestamp * 1000).toISOString() };
  f.admin.auth.getUser = async () => ({ data: { user: { id: 'owner', email: 'owner@example.test' } }, error: null });
  f.admin.auth.getClaims = async token => { assert.equal(token, 'verified-token'); return { data: { claims: f.claims }, error: null }; };
  f.admin.rpc = async (name, args) => {
    if (name === 'request_account_deletion' || name === 'account_deletion_status') {
      f.calls.push([name, args]);
      return { data: { status: f.completed ? 'completed' : 'processing', isDeleted: f.completed } };
    }
    return rpc(name, args);
  };
  return f;
}

test('request and worker defaults are off without backend effects; immediate processing is separately opt-in', async () => {
  const unused = new Proxy({}, { get() { assert.fail('Disabled operation touched backend'); } });
  assert.deepEqual(await runDeletionTick(unused), { status: 'disabled' });
  assert.equal((await createDeletionHandler(unused)(request({ action: 'request' }))).status, 503);
  const f = requestFixture();
  const result = await createDeletionHandler(f.admin, { enabled: true })(request({ action: 'request', confirmation: 'owner@example.test' }));
  assert.equal(result.status, 202); assert.equal((await result.json()).status, 'processing');
  assert.deepEqual(f.calls.map(([name]) => name), ['request_account_deletion']);
});

test('Storage and anonymization checkpoints precede Auth; provider absence and SQL finish own completion', async () => {
  const f = fixture(); assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'completed');
  assert.ok(f.events.indexOf('checkpoint_account_deletion_files') < f.events.indexOf('anonymize_account_deletion'));
  const deleted = f.events.findIndex(event => Array.isArray(event) && event[0] === 'deleteAuth');
  assert.ok(deleted > f.events.indexOf('anonymize_account_deletion'));
  assert.deepEqual(f.events.slice(deleted, deleted + 3), [['deleteAuth', 'owner'], ['lookup', 'owner'], 'finish_account_deletion']);
  assert.equal(f.completed, true);
});

test('Storage failure, ambiguous replies and SQL-observed remaining objects never advance to Auth', async () => {
  for (const options of [{ storageError: true }, { storageEmptyReply: true }, { storageStillPresent: true }]) {
    const f = fixture(options); assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'retry');
    assert.ok(!f.events.some(event => Array.isArray(event) && event[0] === 'deleteAuth')); assert.equal(f.completed, false);
  }
  const f = fixture({ lostCheckpoint: true });
  assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'retry');
  assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'completed');
  const removals = f.events.filter(event => Array.isArray(event) && event[0] === 'remove');
  assert.equal(removals.length, 2); assert.deepEqual(removals[0], removals[1]);
});

test('oversized or malformed batches are rejected before removal; valid 100-object batches remain bounded', async () => {
  for (const files of [Array.from({ length: 101 }, (_, i) => ({ bucket: 'message-media', path: `owner/${i}` })), [], null, [null], [{ bucket: 'message-media' }]]) {
    const f = fixture({ files: files === null ? 'not-an-array' : files });
    assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'retry');
    assert.ok(!f.events.some(event => Array.isArray(event) && event[0] === 'remove'));
  }
  const f = fixture({ files: Array.from({ length: 100 }, (_, i) => ({ bucket: i < 50 ? 'project-media' : 'message-media', path: `owner/${i}` })) });
  assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'completed');
  assert.deepEqual(f.events.filter(event => Array.isArray(event) && event[0] === 'remove').map(event => event.length - 2), [50, 50]);
});

test('lost Auth acknowledgement resumes from explicit absence without deleting Auth twice', async () => {
  const f = fixture({ lostAuth: true });
  assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'retry');
  assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'completed');
  assert.equal(f.events.filter(event => Array.isArray(event) && event[0] === 'deleteAuth').length, 1);
  assert.equal(f.calls.find(([name]) => name === 'fail_account_deletion')[1].p_error, 'Deletion needs retry');
});

test('401, generic 404, ambiguous Auth lookup and wrong identity never imply absence', async () => {
  for (const options of [
    { lookupError: { status: 401, code: 'bad_jwt' } }, { lookupError: { status: 401, code: 'user_not_found' } },
    { lookupError: { status: 404 } }, { lookupError: { code: 'network' } },
    { lookupResponse: () => ({ data: { user: null }, error: null }) }, { authIdentity: 'victim' },
  ]) {
    const f = fixture({ authPhase: true, ...options });
    assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'retry');
    assert.ok(!f.events.includes('finish_account_deletion'));
    assert.ok(!f.events.some(event => Array.isArray(event) && event[0] === 'deleteAuth'));
  }
});

test('Auth deletion or post-delete lookup uncertainty and SQL finish failure remain retryable', async () => {
  for (const options of [{ deleteError: { status: 401, code: 'bad_jwt' } }, { deleteEmptyReply: true }, { postDeleteLookupError: true }]) {
    const f = fixture({ authPhase: true, ...options });
    assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'retry');
    assert.ok(!f.events.includes('finish_account_deletion')); assert.equal(f.completed, false);
  }
  const f = fixture({ authPhase: true, finishError: true });
  assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'retry'); assert.equal(f.completed, false);
  assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'completed');
  assert.equal(f.events.filter(event => Array.isArray(event) && event[0] === 'deleteAuth').length, 1);
});

test('a bounded tick yields at a checkpoint and never accepts a mismatched claimed caller', async () => {
  const f = fixture(); assert.equal((await runDeletionTick(f.admin, { enabled: true, maxBatches: 1 })).status, 'checkpointed');
  assert.equal((await runDeletionTick(f.admin, { enabled: true })).status, 'completed');
  const other = fixture({ jobAccount: 'victim' });
  assert.equal((await runDeletionTick(other.admin, { enabled: true, accountId: 'owner' })).status, 'retry');
  assert.deepEqual(other.events, ['claim_account_deletion']);
});

test('HTTP request uses verified caller and typed email; cancellation is absent', async () => {
  const f = requestFixture(), on = createDeletionHandler(f.admin, { enabled: true });
  assert.equal((await on(request({ action: 'cancel', accountId: 'victim' }))).status, 400); assert.equal(f.calls.length, 0);
  assert.equal((await on(request({ action: 'request', confirmation: 'wrong' }))).status, 400);
  assert.equal((await on(request({ action: 'request', confirmation: 'owner@example.test' }, null))).status, 401);
  const result = await on(request({ action: 'request', confirmation: ' OWNER@example.test ', accountId: 'victim', p_account_id: 'victim' }));
  assert.equal(result.status, 202); assert.equal((await result.json()).isDeleted, false);
  assert.deepEqual(f.calls, [['request_account_deletion', { p_account_id: 'owner', ...f.signIn, p_receipt_hash: receiptHash(receipt) }]]);
  const status = await createDeletionHandler(f.admin)(request({ action: 'status', accountId: 'victim' }));
  assert.equal((await status.json()).status, 'processing');
  assert.deepEqual(f.calls.at(-1), ['account_deletion_status', { p_account_id: 'owner' }]);
});

test('uncertain request/authentication replies remain truthful and do not promise email reuse', async () => {
  for (const mode of ['rpc-error', 'rpc-throw', 'rpc-empty', 'auth-throw']) {
    const f = requestFixture();
    if (mode === 'auth-throw') f.admin.auth.getUser = async () => { throw Error('private token transport'); };
    else f.admin.rpc = async () => { if (mode === 'rpc-throw') throw Error('reply lost'); return mode === 'rpc-empty' ? {} : { error: { message: 'reply lost' } }; };
    const result = await createDeletionHandler(f.admin, { enabled: true })(request({ action: 'request', confirmation: 'owner@example.test' }));
    assert.equal(result.status, 503); const body = await result.json(); assert.equal(body.isDeleted, false);
    assert.match(body.message, /Check your deletion status/); assert.doesNotMatch(body.message, /register again|token transport/);
  }
});

test('status reports no job without inventing progress and accepts completion only with SQL confirmation', async () => {
  const f = requestFixture(), handler = createDeletionHandler(f.admin);
  for (const [data, expected, deleted] of [[{}, 200, false], [{ status: 'completed' }, 503, false], [{ status: 'completed', isDeleted: true }, 200, true]]) {
    f.admin.rpc = async () => ({ data });
    const result = await handler(request({ action: 'status' }));
    assert.equal(result.status, expected); const body = await result.json();
    assert.equal(body.isDeleted, deleted);
    if (Object.keys(data).length === 0) assert.equal(body.status, 'none');
  }
});

test('an idempotent completed request retains canonical SQL completion without another worker claim', async () => {
  const f = requestFixture();
  f.admin.rpc = async (name, args) => {
    assert.equal(name, 'request_account_deletion'); assert.deepEqual(args, { p_account_id: 'owner', ...f.signIn, p_receipt_hash: receiptHash(receipt) });
    return { data: { status: 'completed', isDeleted: true } };
  };
  const result = await createDeletionHandler(f.admin, { enabled: true, processImmediately: true })(request({ action: 'request', confirmation: 'owner@example.test' }));
  assert.equal(result.status, 200); assert.equal((await result.json()).isDeleted, true);
  assert.equal(f.events.length, 0);
});

test('immediate HTTP processing completes only after the verified caller Auth absence and SQL finish', async () => {
  const f = requestFixture();
  const result = await createDeletionHandler(f.admin, { enabled: true, processImmediately: true })(request({ action: 'request', confirmation: 'owner@example.test', accountId: 'victim' }));
  assert.equal(result.status, 200); assert.equal((await result.json()).isDeleted, true);
  assert.deepEqual(f.calls.find(([name]) => name === 'claim_account_deletion')[1], { p_account_id: 'owner' });
  assert.equal(f.completed, true);
});

test('immediate cleanup failures keep processing and reserve the email without claiming completion', async () => {
  for (const options of [{ storageError: true }, { storageStillPresent: true }, { lostAuth: true }, { finishError: true }, { claimIdle: true }]) {
    const f = requestFixture(options);
    const result = await createDeletionHandler(f.admin, { enabled: true, processImmediately: true })(request({ action: 'request', confirmation: 'owner@example.test' }));
    assert.equal(result.status, 202); const body = await result.json();
    assert.equal(body.isDeleted, false); assert.equal(body.status, 'processing');
    assert.match(body.message, /Deletion in progress.*email remains reserved/); assert.doesNotMatch(body.message, /register again/);
  }
});

test('fresh provider-verified AMR is bound to the same token, account, issuer and active-session request', async () => {
  const now = 2_000_000_000;
  for (const method of ['password', 'oauth', 'otp', 'magiclink', 'sso/saml']) {
    const f = requestFixture();
    f.claims.amr = [{ method, timestamp: now - 299 }]; f.claims.exp = now + 3600;
    const result = await createDeletionHandler(f.admin, { enabled: true, now: () => now * 1000 })(request({ action: 'request', confirmation: 'owner@example.test' }));
    assert.equal(result.status, 202);
    assert.deepEqual(f.calls[0][1], { p_account_id: 'owner', p_session_id: f.claims.session_id, p_authenticated_at: new Date((now - 299) * 1000).toISOString(), p_receipt_hash: receiptHash(receipt) });
  }
});

test('stale, future, missing, unproven and cross-account claims cannot authorize deletion', async () => {
  const now = 2_000_000_000;
  const cases = [
    { amr: [{ method: 'password', timestamp: now - 301 }] },
    { amr: [{ method: 'password', timestamp: now + 1 }] },
    { amr: [{ method: 'password', timestamp: String(now) }] },
    { amr: undefined }, { amr: [] }, { amr: [{ method: 'unproven-provider', timestamp: now }] },
    { sub: 'victim' }, { iss: 'https://another.supabase.co/auth/v1' }, { session_id: undefined },
    { session_id: 'not-a-session' }, { role: 'service_role' }, { is_anonymous: true },
    { aud: 'anon' }, { exp: now },
  ];
  for (const changes of cases) {
    const f = requestFixture(); f.claims = { ...f.claims, exp: now + 3600, amr: [{ method: 'password', timestamp: now }], ...changes };
    const response = await createDeletionHandler(f.admin, { enabled: true, now: () => now * 1000 })(request({ action: 'request', confirmation: 'owner@example.test', authenticatedAt: now, amr: [{ method: 'password', timestamp: now }], accountId: 'victim' }));
    assert.equal(response.status, 401, JSON.stringify(changes)); assert.equal(f.calls.length, 0);
    assert.equal((await response.json()).isDeleted, false);
  }
});

test('token refresh, recovery and account-global sign-in timestamps do not satisfy recent sign-in', async () => {
  const now = 2_000_000_000;
  for (const method of ['token_refresh', 'recovery', 'invite', 'email/signup', 'email_change', 'anonymous', 'totp']) {
    const f = requestFixture();
    f.claims = { ...f.claims, exp: now + 3600, iat: now, auth_time: now,
      amr: [{ method: 'password', timestamp: now - 3600 }, { method, timestamp: now }], user_metadata: { last_sign_in_at: new Date(now * 1000).toISOString() } };
    f.admin.auth.getUser = async () => ({ data: { user: { id: 'owner', email: 'owner@example.test', last_sign_in_at: new Date(now * 1000).toISOString() } }, error: null });
    const response = await createDeletionHandler(f.admin, { enabled: true, now: () => now * 1000 })(request({ action: 'request', confirmation: 'owner@example.test' }));
    assert.equal(response.status, 401); assert.equal(f.calls.length, 0);
  }
});

test('forged claims and failed provider verification never reach a deletion RPC', async () => {
  const f = requestFixture(); let verified = 0;
  f.admin.auth.getClaims = async token => { assert.equal(token, 'forged-token'); verified++; return { data: null, error: { message: 'invalid signature' } }; };
  const response = await createDeletionHandler(f.admin, { enabled: true })(request({ action: 'request', confirmation: 'owner@example.test', claims: f.claims }, 'forged-token'));
  assert.equal(response.status, 401); assert.equal(verified, 1); assert.equal(f.calls.length, 0);
  delete f.admin.auth.getClaims;
  assert.equal((await createDeletionHandler(f.admin, { enabled: true })(request({ action: 'request', confirmation: 'owner@example.test' }))).status, 503);
  assert.equal(f.calls.length, 0);
});

test('a session revoked or aged out between provider checks and the atomic request requires sign-in again', async () => {
  for (const message of ['recent sign-in required', 'active account session required']) {
    const f = requestFixture(); f.admin.rpc = async () => ({ error: { message } });
    const response = await createDeletionHandler(f.admin, { enabled: true })(request({ action: 'request', confirmation: 'owner@example.test' }));
    assert.equal(response.status, 401);
    assert.match((await response.json()).message, /Sign in again.*five minutes/);
    assert.equal(f.completed, false);
  }
});

test('receipt lifetime and retention require explicit operator configuration before backend access', async () => {
  const unused = new Proxy({}, { get() { assert.fail('Unconfigured deletion touched backend'); } });
  for (const options of [{}, {receiptLifetimeSeconds:3600}, {receiptRetentionSeconds:7200},
    {receiptLifetimeSeconds:0,receiptRetentionSeconds:7200}, {receiptLifetimeSeconds:3600,receiptRetentionSeconds:-1}]) {
    for(const action of ['prepare','request'])assert.equal((await candidateDeletionHandler(unused,{enabled:true,...options})(request({action}))).status,503);
  }
});

test('prepare mints independent 256-bit receipts and sends only their digests to durable storage', async () => {
  const f=requestFixture(), handler=createDeletionHandler(f.admin,{enabled:true});
  const first=await (await handler(request({action:'prepare'}))).json();
  const second=await (await handler(request({action:'prepare'}))).json();
  assert.match(first.receipt,/^[0-9a-f]{64}$/);assert.match(second.receipt,/^[0-9a-f]{64}$/);assert.notEqual(first.receipt,second.receipt);
  const calls=f.calls.filter(([name])=>name==='prepare_account_deletion_receipt');assert.equal(calls.length,2);
  assert.equal(calls[0][1].p_token_hash,receiptHash(first.receipt));assert.equal(calls[1][1].p_token_hash,receiptHash(second.receipt));
  assert.equal(calls[0][1].p_account_id,'owner');assert.ok(Date.parse(calls[0][1].p_purge_after)>Date.parse(calls[0][1].p_expires_at));
  assert.equal(JSON.stringify(f.calls).includes(first.receipt),false);assert.equal(f.events.includes('request_account_deletion'),false);
});

test('preparation rejects a different expected account without minting or storing a capability',async()=>{
 const f=requestFixture();
 const result=await createDeletionHandler(f.admin,{enabled:true})(request({action:'prepare',expectedAccountId:'other'}));
 assert.equal(result.status,401);assert.equal(f.calls.length,0);assert.equal((await result.json()).receipt,undefined);
});

test('receipt status survives provider absence, strips identifiers and requires both completion markers', async () => {
  const calls=[];
  const admin={auth:new Proxy({},{get(){assert.fail('Receipt status touched deleted Auth provider');}}),rpc:async(name,args)=>{calls.push([name,args]);return {data:{status:'completed',isDeleted:true,id:'private-job',account_id:'private-owner',email:'private@example.test',receipt:'private-token'}};}};
  const handler=candidateDeletionHandler(admin);
  const response=await handler(request({action:'status',receipt,accountId:'victim'},null));
  assert.equal(response.status,200);assert.deepEqual(Object.keys(await response.json()).sort(),['isDeleted','message','status']);
  assert.deepEqual(calls,[['account_deletion_receipt_status',{p_token_hash:receiptHash(receipt)}]]);
  for(const data of [{status:'completed',isDeleted:false},{status:'completed'},{isDeleted:true},{}, {status:'processing',isDeleted:true}]){
    admin.rpc=async()=>({data});const result=await handler(request({action:'status',receipt},null));
    assert.equal(result.status,403);assert.equal((await result.json()).isDeleted,false);
  }
  let reads=0;admin.rpc=async()=>{reads++;return {data:{}};};
  for(const token of [null,'','x'.repeat(64),'a'.repeat(63),'A'.repeat(64)])assert.equal((await handler(request({action:'status',receipt:token},null))).status,403);
  assert.equal(reads,0);
});

test('D1 cleanup and durable checkpoint are mandatory before Auth, with truthful recovery after lost replies',async()=>{
 const f=fixture();
 assert.equal((await candidateRunDeletionTick(f.admin,{enabled:true})).status,'retry');
 assert.deepEqual(f.events,[],'Missing D1 configuration must fail before claims or destructive work.');
 assert.equal((await candidateRunDeletionTick(f.admin,{enabled:true,d1:createD1DeletionAdapter()})).status,'retry');assert.deepEqual(f.events,[]);
 const manifests=[];let lose=true;
 const d1=async manifest=>{manifests.push(manifest);if(lose){lose=false;throw Error('D1 reply lost');}return successfulD1(manifest);};
 assert.equal((await candidateRunDeletionTick(f.admin,{enabled:true,d1})).status,'retry');
 assert.ok(f.events.includes('anonymize_account_deletion'));
 assert.equal((await candidateRunDeletionTick(f.admin,{enabled:true,d1})).status,'completed');
 assert.deepEqual(manifests[0],manifests[1]);
 const checkpoint=f.events.indexOf('checkpoint_account_deletion_d1');const auth=f.events.findIndex(value=>Array.isArray(value)&&value[0]==='deleteAuth');assert.ok(checkpoint<auth);
 for(const reply of [{completed:false},{completed:true,jobId:'other',manifestDigest:'a'.repeat(64)},{completed:true,jobId:'job',manifestDigest:'wrong'}]){
  const other=fixture();assert.equal((await candidateRunDeletionTick(other.admin,{enabled:true,d1:async()=>reply})).status,'retry');assert.equal(other.events.some(value=>Array.isArray(value)&&value[0]==='deleteAuth'),false);
 }
 const options={d1CheckpointError:true}, checkpointed=fixture(options);
 assert.equal((await runDeletionTick(checkpointed.admin,{enabled:true})).status,'retry');assert.equal(checkpointed.events.some(value=>Array.isArray(value)&&value[0]==='deleteAuth'),false);
 options.d1CheckpointError=false;assert.equal((await runDeletionTick(checkpointed.admin,{enabled:true})).status,'completed');
});

test('D1 transport signs the exact purpose and bounded immutable manifest using only its dedicated secret',async()=>{
 const manifest={version:1,jobId:'00000000-0000-4000-8000-000000000001',accountId:'00000000-0000-4000-8000-000000000002',ownedProjectIds:['00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003']};
 const secret='c'.repeat(64),url='https://portalink.example/api/internal/account-deletion/d1',now=2_000_000_000;let calls=0;
 const adapter=createD1DeletionAdapter({url,secret,now:()=>now*1000,fetchImpl:async(endpoint,options)=>{
  calls++;assert.equal(endpoint,url);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert.deepEqual(body.ownedProjectIds,[...manifest.ownedProjectIds].sort());assert.equal(body.issuedAt,now);assert.equal(body.expiresAt,now+300);
  assert.equal(options.headers['x-portalink-deletion-signature'],createHmac('sha256',secret).update('portalink-account-deletion-d1:v1\nPOST\n/api/internal/account-deletion/d1\n'+options.body).digest('hex'));
  assert.equal(options.headers.authorization,undefined);assert.equal(options.body.includes(secret),false);
  return Response.json({completed:true,jobId:manifest.jobId,manifestDigest:await deletionManifestDigest(manifest)});
 }});
 assert.equal((await adapter(manifest)).completed,true);assert.equal(calls,1);
 for(const config of [{},{url,secret:'service-role-jwt'},{url:url+'?account=x',secret},{url:url.replace('https:','http:'),secret}]){
  await assert.rejects(createD1DeletionAdapter({...config,fetchImpl:()=>assert.fail('Invalid config sent data')})(manifest));
 }
 for(const ownedProjectIds of [['bad-id'],[manifest.ownedProjectIds[0],manifest.ownedProjectIds[0]],Array.from({length:1001},(_,index)=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`)]){
  await assert.rejects(adapter({...manifest,ownedProjectIds}));
 }
 assert.equal(calls,1);
 for(const response of [Response.json({completed:false}),Response.json({completed:true,jobId:manifest.jobId,manifestDigest:'bad'}),new Response('x'.repeat(4097)),new Response(null,{status:503})]){
  await assert.rejects(createD1DeletionAdapter({url,secret,now:()=>now*1000,fetchImpl:async()=>response})(manifest));
 }
});
