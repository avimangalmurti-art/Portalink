import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

export const ROOT = new URL('../../', import.meta.url);
export const read = path => readFileSync(new URL(path, ROOT), 'utf8');
export function loadModule(path, extras = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder, AbortSignal, crypto, Date, setTimeout, clearTimeout,
    require: id => {
      if (id.endsWith('readSignal')) return loadModule('src/features/reads/readSignal.ts');
      throw new Error(`Unexpected import ${id}`);
    }, ...extras,
  });
  return exports;
}
export const api = loadModule('src/server/projectReach.ts');
export const ids = { project:'10000000-0000-4000-8000-000000000001', profile:'20000000-0000-4000-8000-000000000001', owner:'30000000-0000-4000-8000-000000000001', other:'30000000-0000-4000-8000-000000000002', attachment:'40000000-0000-4000-8000-000000000001', token:'50000000-0000-4000-8000-000000000001' };
export const payload = changes => ({project_id:ids.project,session_token:ids.token,furthest_page:-1,page_count:3,ref_class:'own-link',vw_bucket:'<400',...changes});
export const request = (path, body, account) => new Request(`https://portalink.example${path}`, {method:body===undefined?'GET':'POST',headers:account?{authorization:`Bearer ${account}`}:{},...(body===undefined?{}:{body:JSON.stringify(body)})});
export function fixture({ pending = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(read('drizzle/0000_media_interactions.sql'));
  sqlite.exec(read('drizzle/0001_saved_media_read_index.sql'));
  if(pending) sqlite.exec(read('drizzle/0003_project_read_signals.sql'));
  const db = {prepare(sql) {let values=[];return {bind(...args){values=args;return this;},async first(){return sqlite.prepare(sql).get(...values)??null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){return sqlite.prepare(sql).run(...values);}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const project = {id:ids.project,profile_id:ids.profile,category_id:ids.profile,title:'Design study',pdf_page_count:3,is_hidden:false,profile:{id:ids.profile,account_id:ids.owner,is_private:false},category:{id:ids.profile,profile_id:ids.profile,is_hidden:false},attachments:[{id:ids.attachment,storage_path:'private/original.pdf',kind:'document',position:0,metadata:{pageCount:3}}]};
  const calls=[];
  const config={supabaseUrl:'https://fixture.supabase.test',publishableKey:'fixture-public-key',authenticate:async(req)=>{const id=req.headers.get('authorization')?.replace('Bearer ','');return id?{id}:null;},fetcher:async(url,options)=>{
    if (options.redirect !== 'manual') throw new Error('Public/owner lookup must use workerd-compatible redirect refusal');
    calls.push({url,options});const parsed=new URL(url);let rows=[];
    if(parsed.pathname.endsWith('/projects')) rows=[project];
    if(parsed.pathname.endsWith('/profiles')){const account=parsed.searchParams.get('account_id');rows=account?.startsWith('eq.')?[{id:account===`eq.${ids.owner}`?ids.profile:ids.other,account_id:account.slice(3),name:'Reader'}]:[{id:ids.other,account_id:ids.other,name:'Reader'}];}
    return Response.json(rows);
  }};
  return {sqlite,db,config,project,calls};
}
