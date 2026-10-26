import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const plain=v=>JSON.parse(JSON.stringify(v));
function methods(file,names,globals={}){
 const source=ts.createSourceFile(file,readFileSync(new URL('../'+file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);const found=[];
 const walk=node=>{if(ts.isMethodDeclaration(node)&&names.includes(node.name.getText(source)))found.push(node.getText(source));ts.forEachChild(node,walk)};walk(source);
 const functions=source.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='identitySearchVariants').map(n=>n.getText(source)).join('\n');
 const exports={};vm.runInNewContext(ts.transpileModule(functions+'\nexports.service={'+found.join(',')+'}',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,...globals});return exports.service;
}
test('city feed pages the full public profile corpus with stable keyset order',async()=>{
 const rows=Array.from({length:501},(_,i)=>({id:String(i).padStart(5,'0'),location:i===500?'London, GB':'Other'}));const calls=[];let chosen;
 const service=methods('src/services/supabase/contentServices.ts',['listLocationProjects'],{locationDirectory:{resolve:async()=>({id:'city'})},profileMatchesPlace:value=>value==='London, GB',creatorLocationMatches:()=>false,projectIdsForProfiles:async ids=>{chosen=ids;return ['project']},projectViewsForIds:async ids=>ids,requireSupabase:()=>({from(){let after='',limit;const q={select(){return q},eq(k,v){calls.push([k,v]);return q},order(k){assert.equal(k,'id');return q},gt(k,v){after=v;return q},limit(n){limit=n;return q},then(resolve){return Promise.resolve({data:rows.filter(r=>r.id>after).slice(0,limit)}).then(resolve)}};return q}})});
 assert.deepEqual(plain(await service.listLocationProjects('city')),['project']);assert.deepEqual(plain(chosen),['00500']);assert.equal(calls.length,2);assert.ok(calls.every(([key,value])=>key==='is_private'&&value===false));
});
test('public account search filters before paging and quotes literal punctuation and wildcards',async()=>{
 const calls=[];const q={select(v){calls.push(['select',v]);return q},eq(k,v){calls.push(['eq',k,v]);return q},or(v){calls.push(['or',v]);return q},order(v){calls.push(['order',v]);return q},range(a,b){calls.push(['range',a,b]);return Promise.resolve({data:[{id:'creator',name:'Name',handle:'name',location:'Town'}]})}};
 const service=methods('src/services/supabase/contentServices.ts',['searchAccounts'],{requireSupabase:()=>({auth:{getSession:async()=>({data:{session:null},error:null})},from:()=>q}),throwProfileError:e=>{throw e}});
 const results=await service.searchAccounts('@name_%",x',30);assert.equal(results[0].kind,'@name');assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='is_private'&&c[2]===false));assert.deepEqual(calls.find(c=>c[0]==='range'),['range',30,59]);const filter=calls.find(c=>c[0]==='or')[1];assert.ok(filter.includes('\\\\_'));assert.ok(filter.includes('\\\\%'));assert.ok(filter.includes('\\"'));assert.equal(await service.searchAccounts('  ').then(r=>r.length),0);
});
test('public account search accepts guest sessions but fails closed on a session-check error',async()=>{
 for(const identity of [{session:null},{session:{user:{id:'anonymous',is_anonymous:true}}},{session:{user:{id:'account'}}},{session:null,error:{message:'offline'}}]){
  let queries=0;
  const client={auth:{getSession:async()=>({data:{session:identity.session},error:identity.error??null})},from(table){
   queries++;assert.equal(table,'profiles');const query={select:()=>query,eq(column,value){assert.equal(column,'is_private');assert.equal(value,false);return query},or:()=>query,order:()=>query,range:async(start,end)=>{assert.equal(start,0);assert.equal(end,29);return{data:[],error:null}}};return query;
  }};
  const service=methods('src/services/supabase/contentServices.ts',['searchAccounts'],{requireSupabase:()=>client,throwProfileError:error=>{throw error}});
  if(identity.error){await assert.rejects(service.searchAccounts('Creator'),/session could not be checked/);assert.equal(queries,0);}
  else{assert.equal((await service.searchAccounts('Creator')).length,0);assert.equal(queries,1);}
 }
});
function messageFixture({messageRows=[],identities=()=>[]}={}){
 const calls=[];const service=methods('src/services/supabase/messagingService.ts',['searchConversations','searchRecipients'],{viewerProfileId:async()=> 'viewer',publicMessageError:e=>e,readConversationSummaries:async({conversationIds=[]})=>({conversations:conversationIds.map(id=>({id,lastMessageAt:'2026-10-03'}))}),requireSupabase:()=>({rpc:async(name,args)=>{calls.push({rpc:name,...args});return{data:identities(args)}} ,from(table){let a,b;const q={select(){return q},ilike(k,v){calls.push({table,pattern:v});return q},order(){return q},or(){return q},range(start,end){a=start;b=end;calls.push({table,start,end});return Promise.resolve({data:table==='direct_messages'?messageRows.slice(a,b+1):[]})}};return q}})});return{service,calls};
}
test('message queries preserve punctuation and escape SQL wildcard characters',async()=>{
 for(const [query,pattern] of [['a_b','%a\\_b%'],['50%','%50\\%%'],['!!!','%!!!%'],['O’Connor','%O’Connor%']]){const h=messageFixture();await h.service.searchConversations(query);assert.equal(h.calls.find(c=>c.pattern).pattern,pattern);if(query==='O’Connor')assert.deepEqual(h.calls.filter(c=>c.rpc).map(c=>c.p_query),['O’Connor',"O'Connor"]);}
});
test('a busy conversation cannot conceal later matching conversations',async()=>{
 const h=messageFixture({messageRows:[...Array.from({length:150},()=>({conversation_id:'busy'})),{conversation_id:'older'}]});const result=await h.service.searchConversations('matching',{limit:30});assert.deepEqual(plain(result.map(r=>r.id)),['busy','older']);assert.deepEqual(h.calls.filter(c=>c.table==='direct_messages'&&c.start!==undefined).map(c=>c.start),[0,150]);
});
test('recipient apostrophe aliases merge and deduplicate before stable pagination',async()=>{
 const one={id:'one',name:"O'Connor",handle:'one',avatar_url:''},two={id:'two',name:'O’Connor',handle:'two',avatar_url:''};const h=messageFixture({identities:args=>args.p_query.includes('’')?[two,one]:[one]});const result=await h.service.searchRecipients("O'Connor",{limit:1,offset:1});assert.equal(result.length,1);assert.equal(result[0].id,'two');assert.ok(h.calls.every(c=>c.p_query.includes("'")||c.p_query.includes('’')));
});
