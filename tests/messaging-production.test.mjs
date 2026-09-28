import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function compile(path, require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readSource(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, require });
  return exports;
}

test('message merging is stable, chronological, and replaces server updates by id', () => {
  const { mergeMessages } = compile('../src/features/messages/useMessaging.ts', (name) => {
    if (name === 'react') return {};
    if (name.endsWith('/AuthContext')) return {};
    if (name.endsWith('/ServicesContext')) return {};
    return {};
  });
  const old = { id: 'b', conversationId: 'thread', senderProfileId: 'one', body: 'old', createdAt: '2026-01-01T00:00:02.000Z' };
  const earlier = { id: 'a', conversationId: 'thread', senderProfileId: 'two', body: 'earlier', createdAt: '2026-01-01T00:00:01.000Z' };
  const updated = { ...old, body: 'edited', editedAt: '2026-01-01T00:00:03.000Z' };
  const merged = mergeMessages([old], [updated, earlier, earlier]);
  assert.deepEqual(Array.from(merged, (message) => message.id), ['a', 'b']);
  assert.equal(merged[1].body, 'edited');
});

test('messages UI keeps thread state addressable and uses resilient interaction patterns', () => {
  const page = readSource('../src/components/MessagesPage.tsx');
  const route = readSource('../src/app/useAppRoute.ts');
  const hook = readSource('../src/features/messages/useMessaging.ts');
  assert.match(route, /params\.get\('conversation'\)/);
  assert.match(route, /params\.get\('recipient'\)/);
  assert.match(page, /portalink-message-drafts/);
  assert.match(page, /New messages/);
  assert.match(page, /Earlier messages/);
  assert.match(page, /event\.nativeEvent\.isComposing/);
  assert.match(page, /lg:hidden/);
  assert.match(page, /sessionStorage/);
  assert.match(hook, /requestVersion/);
  assert.match(hook, /subscribeToMessages/);
  assert.doesNotMatch(hook, /10_000/);
  assert.doesNotMatch(page, /aria-live="polite"[^>]*className="[^"]*overflow-y-auto/);
});

test('messaging upgrade enforces privacy, requests, abuse controls, receipts, and private media', () => {
  const sql = readSource('../supabase/migrations/202609050001_production_messaging.sql');
  for (const expected of [
    'messaging_preferences',
    'direct_message_blocks',
    'direct_message_reports',
    'direct_message_reactions',
    'accept_direct_message_request',
    'rate limit reached',
    "values ('message-media', 'message-media', false",
    'direct_reads_participant_select',
    'notifications_unread_message_conversation_idx',
    "'message', '/messages?conversation='",
  ]) assert.ok(sql.includes(expected), expected);
  assert.match(sql, /revoke insert on public\.direct_messages from authenticated/);
  assert.match(sql, /grant update\(body, edited_at\), delete on public\.direct_messages to authenticated/);
});

test('activity is a single actionable destination rather than a duplicate messages inbox', () => {
  const messages = readSource('../src/components/MessagesPage.tsx');
  const activity = readSource('../src/components/messages/InboxPanel.tsx');
  assert.doesNotMatch(messages, /InboxPanel/);
  assert.match(activity, /entry\.targetPath/);
  assert.match(activity, /Mark all read/);
  assert.match(activity, /No activity yet/);
});

test('an unavailable sending RPC fails closed without inserting a message directly', async () => {
  let inserts = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'account' } } } }) },
    from(table) {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'viewer' } }) }) }) };
      return { insert() { inserts++; throw new Error('Unguarded insert'); } };
    },
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'function not found' } }),
  };
  const { supabaseMessagingService } = compile('../src/services/supabase/messagingService.ts', () => ({ requireSupabase: () => client }));
  await assert.rejects(supabaseMessagingService.sendMessage('thread', 'Hello'), /being updated/);
  assert.equal(inserts, 0);
});

test('deleted participants remain readable and removed attachments never receive signed URLs', async () => {
  const signed=[];
  const removed={id:'removed',conversation_id:'chat',sender_profile_id:null,body:'old cached body',removed_at:'2026-09-01T00:00:00Z',created_at:'2026-09-01T00:00:00Z'};
  const surviving={id:'surviving',conversation_id:'chat',sender_profile_id:'viewer',body:'Still here',created_at:'2026-09-01T00:00:01Z'};
  const tables={
    direct_conversations:[{id:'chat',participant_one_profile_id:null,participant_two_profile_id:'viewer',status:'active',established_at:'2026-01-01'}],
    direct_messages:[surviving,removed],
    direct_message_attachments:[{id:'old',message_id:'removed',storage_path:null,removed_at:'2026-09-01'},{id:'kept',message_id:'surviving',storage_path:'viewer/chat/kept.png',file_name:'kept.png',mime_type:'image/png',size_bytes:10}],
  };
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'account'}}}})},from(table){
    const q={select(){return q;},eq(){return q;},or(){return q;},order(){return q;},range(){return q;},limit(){return q;},in(_key,values){assert.ok(values.every(v=>v!==null));return q;},single:async()=>({data:{id:'viewer'}}),then:resolve=>Promise.resolve({data:tables[table]??[],error:null}).then(resolve)};
    return q;
  },rpc:async()=>({data:[{conversation_id:'chat',last_message:surviving,last_incoming_at:removed.created_at}]}),storage:{from:()=>({createSignedUrls:async paths=>{signed.push(...paths);return {data:paths.map(path=>({path,signedUrl:'https://example.test/kept'}))};}})}};
  const {supabaseMessagingService}=compile('../src/services/supabase/messagingService.ts',()=>({requireSupabase:()=>client}));
  const conversation=(await supabaseMessagingService.listConversations()).conversations[0];
  assert.equal(conversation.participant.name,'Deleted User');assert.equal(conversation.participant.id,null);assert.equal(conversation.participant.isDeleted,true);
  const page=await supabaseMessagingService.listMessages('chat');
  assert.equal(page.messages.find(m=>m.id==='removed').body,'Message removed');
  assert.equal(page.messages.find(m=>m.id==='removed').attachments.length,0);
  assert.deepEqual(signed,['viewer/chat/kept.png']);
});
