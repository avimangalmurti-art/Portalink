import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function load(path,globals={}) {const exports={};vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Blob,TextEncoder,...globals});return exports;}
const e=load('src/features/employer/employer.ts');
const plain=value=>JSON.parse(JSON.stringify(value));
const p=(id,extra={})=>({id,title:id,publishedAt:'2026-01-01',pageCount:3,...extra});
const profile=(extra={})=>({id:'owner',name:'Mira Chen',headline:'\n Product designer\nLong biography',location:'London',projects:[p('a'),p('b')],...extra});
test('short headline falls back to first nonblank bio line without altering the long bio',()=>{
 const value=profile();assert.equal(e.profileHeadline(value),'Product designer');assert.match(value.headline,/Long biography/);
 assert.equal(e.profileHeadline(profile({portfolioHeadline:''})), '');
 assert.equal(e.profileHeadline(profile({portfolioHeadline:'New '.repeat(30)})).length,80);
});
test('Start here requires an existing visible project on a public profile',()=>{
 assert.equal(e.startHereProject(profile()),null);assert.equal(e.startHereProject(profile({startHereProjectId:'a'})).id,'a');
 for(const extra of [{isPrivate:true},{projects:[p('a',{isPubliclyVisible:false})]},{projects:[p('a',{sessionOnly:true})]},{projects:[]}])assert.equal(e.startHereProject(profile({startHereProjectId:'a',...extra})),null);
});
test('facts include only supplied values and derive Field from the short headline',()=>{
 assert.deepEqual(plain(e.profileFacts(profile({portfolioHeadline:'Interaction design · Research',school:'SFSU',availability:'Autumn'}))),[{label:'School',value:'SFSU'},{label:'Field',value:'Interaction design'},{label:'City',value:'London'},{label:'Available',value:'Autumn'}]);
 assert.deepEqual(plain(e.profileFacts(profile({headline:'',location:''}))),[]);
 assert.deepEqual(plain(e.profileFacts(profile())),[{label:'City',value:'London'}]);
 assert.deepEqual(plain(e.profileFacts(profile({portfolioHeadline:null,location:''}))),[]);
});
test('contact never falls back to authentication email and requires explicit opt-in',()=>{
 assert.equal(e.contactHref(profile({email:'auth@example.com'})),null);
 assert.equal(e.contactHref(profile({contactEmail:'work@example.com'})),null);
 assert.equal(e.contactHref(profile({contactEmailPublic:true,contactEmail:'work@example.com',isPrivate:true})),null);
 assert.equal(e.contactHref(profile({contactEmailPublic:true,contactEmail:'work@example.com'})),'mailto:work%40example.com?subject=Your%20portfolio%20%E2%80%94%20Mira%20Chen');
 for(const email of ['a@b.com?bcc=evil@x.com','a\nb@c.com','a@b.com,other@c.com',''])assert.equal(e.contactHref(profile({contactEmailPublic:true,contactEmail:email})),null);
});
test('read time uses rounded 20-second pages, with no invented zero-page duration',()=>{
 assert.equal(e.readMinutes(0),null);assert.equal(e.readMinutes(1),'Read in 1 min');assert.equal(e.readMinutes(18),'Read in 6 min');assert.equal(e.readMinutes(20),'Read in 7 min');
});
test('missing columns use conservative contact/pin defaults and preserve deliberate headline clearing',()=>{
 const legacy=e.readEmployerFields({headline:'Bio',email:'private@example.com'});assert.equal(legacy.portfolioHeadline,null);assert.equal(legacy.contactEmailPublic,false);assert.equal(legacy.contactEmail,'');assert.equal(legacy.startHereProjectId,null);assert.equal(legacy.allowPdfDownload,true);
 assert.equal(e.readEmployerFields({portfolio_headline:''}).portfolioHeadline,'');assert.equal(e.readEmployerFields({allow_pdf_download:false}).allowPdfDownload,false);
});
test('actual profile writer rejects absent employer columns without fallback writes or silently saving',async()=>{
 const source=ts.createSourceFile('content.ts',read('src/services/supabase/contentServices.ts'),ts.ScriptTarget.Latest,true);
 const declaration=source.statements.flatMap(n=>ts.isVariableStatement(n)?[...n.declarationList.declarations]:[]).find(n=>n.name.getText(source)==='supabaseProfileService');
 const method=declaration.initializer.properties.find(n=>n.name?.getText(source)==='updateProfile').getText(source);
 const calls=[];let error={code:'PGRST204',message:'portfolio_headline column is missing'};
 const q={update:value=>{calls.push(value);return q;},eq:()=>q,select:()=>q,single:async()=>({data:{id:'owner'},error})};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'owner-account'}}}})},from:()=>q};
 const exports={};vm.runInNewContext(ts.transpileModule(`export const service={${method}};`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,...e,requireSupabase:()=>client,throwProfileError:err=>{throw Error(err.message);}});
 exports.service.getProfile=async()=>profile();
 await assert.rejects(exports.service.updateProfile('owner',{portfolioHeadline:'New'}),/not enabled yet/);assert.equal(calls.length,1);assert.deepEqual(plain(calls[0]),{portfolio_headline:'New'});
 error=null;await exports.service.updateProfile('owner',{name:'Name'});assert.deepEqual(plain(calls[1]),{name:'Name'});
 await exports.service.updateProfile('owner',{contactEmailPublic:false,contactEmail:'old@example.com'});assert.deepEqual(plain(calls[2]),{contact_email_public:false,contact_email:null});
 await assert.rejects(exports.service.updateProfile('owner',{portfolioHeadline:'a'.repeat(81)}),/80/);assert.equal(calls.length,3);
});
test('pending schema gates contact at rest, pins only own visible work, and atomically replaces the public bundle',()=>{
 const sql=read('supabase/pending/profile_employer.sql');
 for(const pattern of [/portfolio_headline text/,/contact_email_public boolean not null default false/,/contact_email is not null/,/else null end/,/on delete set null/,/p.profile_id=new.id and not p.is_hidden and not c.is_hidden for share/,/create or replace function public.shared_profile_bundle/,/'allow_pdf_download',coalesce/,/security invoker/])assert.match(sql,pattern);
 assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/auth\.users|add column.*headline.*80/);
});
