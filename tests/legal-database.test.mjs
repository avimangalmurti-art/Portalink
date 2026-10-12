import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
const migration=readFileSync(new URL('../supabase/pending/legal_documents_and_acceptances.sql',import.meta.url),'utf8');
const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
async function database(){
  const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create schema extensions;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
    -- Test-only digest stand-in; production requires the existing pgcrypto digest.
    create function extensions.digest(text,text) returns bytea language sql as $$select decode(md5($1)||md5($1),'hex')$$;`);
  await db.exec(migration);return db;
}
async function authenticate(db,id=owner){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);}
test('four draft documents are public read-only; acceptance reads/inserts are owner-only with no update/delete permissions',async()=>{
  const db=await database();try{
    await db.exec('set role anon');const docs=(await db.query('select * from public.legal_documents')).rows;assert.equal(docs.length,4);assert.ok(docs.every(row=>row.version==='1.0'&&row.markdown_body.includes('[DRAFT — not yet reviewed by counsel]')));
    await assert.rejects(db.query('select * from public.terms_acceptances'));
    await authenticate(db);await db.query(`insert into public.terms_acceptances(account_id,document_key,version) select $1,key,version from public.legal_documents`,[owner]);
    assert.equal((await db.query('select * from public.terms_acceptances')).rows.length,4);
    await assert.rejects(db.query(`insert into public.terms_acceptances(account_id,document_key,version) values($1,'terms','1.0')`,[other]));
    for(const sql of ['update public.terms_acceptances set version=\'2.0\'','delete from public.terms_acceptances','delete from public.legal_documents'])await assert.rejects(db.query(sql));
    await authenticate(db,other);assert.equal((await db.query('select * from public.terms_acceptances')).rows.length,0);
  }finally{await db.close();}
});
test('acceptance version is validated against latest effective version, audit fields are server stamped, and duplicates cannot change acceptance time',async()=>{
  const db=await database();try{
    await db.exec(`select set_config('request.headers','{"user-agent":"synthetic-agent","x-forwarded-for":"192.0.2.1"}',false)`);await authenticate(db);
    await db.query(`insert into public.terms_acceptances values($1,'terms','1.0','2000-01-01','forged','forged')`,[owner]);
    const row=(await db.query('select * from public.terms_acceptances')).rows[0];assert.notEqual(row.accepted_at,'2000-01-01');assert.equal(row.user_agent,'synthetic-agent');assert.equal(row.ip_hash.length,64);assert.ok(!row.ip_hash.includes('192.0.2.1'));
    await db.query(`insert into public.terms_acceptances(account_id,document_key,version) values($1,'terms','1.0') on conflict do nothing`,[owner]);
    assert.equal((await db.query('select accepted_at from public.terms_acceptances')).rows[0].accepted_at.toISOString(),row.accepted_at.toISOString());
    await db.exec(`reset role;insert into public.legal_documents select key,'1.1',title,markdown_body,now() from public.legal_documents where key='privacy';`);await authenticate(db);
    await assert.rejects(db.query(`insert into public.terms_acceptances(account_id,document_key,version) values($1,'privacy','1.0')`,[owner]));
    await db.query(`insert into public.terms_acceptances(account_id,document_key,version) values($1,'privacy','1.1')`,[owner]);
    assert.equal((await db.query(`select version from public.terms_acceptances where document_key='privacy'`)).rows[0].version,'1.1');
  }finally{await db.close();}
});
