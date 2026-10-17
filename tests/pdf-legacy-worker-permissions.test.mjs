import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH ?? process.env.PGLITE_MODULE;
const candidate = readFileSync(new URL('../supabase/pending/pdf_legacy_worker_permissions.sql', import.meta.url), 'utf8');
const signatures = [
  'public.claim_pdf_processing_job(text,integer)',
  'public.complete_pdf_processing_job(uuid,integer,jsonb)',
  'public.fail_pdf_processing_job(uuid,text,text,integer,boolean)',
  'public.report_pdf_processing_progress(uuid,integer,integer)',
];
test('legacy PDF containment uses actual PostgreSQL ACLs and fails closed on drift', {skip: !modulePath}, async t => {
  const {PGlite} = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      grant usage on schema public to anon,authenticated,service_role;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
      create table synthetic_queue(id integer primary key,status text);
      insert into synthetic_queue values(1,'queued');
      create function public.claim_pdf_processing_job(text,integer) returns void language sql security definer as $$update synthetic_queue set status='claimed'$$;
      create function public.complete_pdf_processing_job(uuid,integer,jsonb) returns void language sql security definer as $$update synthetic_queue set status='completed'$$;
      create function public.fail_pdf_processing_job(uuid,text,text,integer,boolean) returns void language sql security definer as $$update synthetic_queue set status='failed'$$;
      create function public.report_pdf_processing_progress(uuid,integer,integer) returns void language sql security definer as $$update synthetic_queue set status='processing'$$;
      create function public.retry_pdf_processing(text) returns text language sql as $$select 'owner retry unchanged'::text$$;`);
    const definitions = await db.query('select oid::regprocedure::text signature,md5(pg_get_functiondef(oid)) digest from pg_proc where pronamespace=\'public\'::regnamespace order by signature');
    let synthetic = candidate;
    for (const signature of signatures) {
      const row = definitions.rows.find(row=>`public.${row.signature}` === signature || row.signature === signature);
      assert.ok(row, signature);
      // Substitute only fixture hashes; execute the complete unchanged guards/ACL SQL.
      const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      synthetic = synthetic.replace(new RegExp(`('${escaped}', ')[a-f0-9]{32}(')`), `$1${row.digest}$2`);
    }
    await t.test('unreviewed definition drift prevents every privilege change', async()=>{
      await assert.rejects(db.exec(candidate),/Legacy PDF definition changed/);
      await db.exec('rollback');
      assert.equal(await scalar("select has_function_privilege('anon',$1,'EXECUTE')",[signatures[0]]),true);
    });
    await t.test('reviewed containment is repeatable and preserves data and bodies', async()=>{
      await db.exec(synthetic); await db.exec(synthetic);
      assert.equal(await scalar('select status from synthetic_queue'),'queued');
      const current=await db.query('select oid::regprocedure::text signature,md5(pg_get_functiondef(oid)) digest from pg_proc where pronamespace=\'public\'::regnamespace order by signature');
      assert.deepEqual(current.rows,definitions.rows);
      for (const signature of signatures) {
        for (const browser of ['anon','authenticated']) assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')',[browser,signature]),false);
        assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE')",[signature]),true);
      }
      assert.equal(await scalar("select has_function_privilege('authenticated','public.retry_pdf_processing(text)','EXECUTE')"),true);
    });
    await t.test('browser invocation is denied before the mutator body runs', async()=>{
      await db.exec('set role anon');
      await assert.rejects(db.query("select claim_pdf_processing_job('synthetic',1200)"),/permission denied/);
      await db.exec('reset role');
      assert.equal(await scalar('select status from synthetic_queue'),'queued');
    });
    await t.test('service worker invocation remains available',async()=>{
      await db.exec('set role service_role');
      await db.query("select claim_pdf_processing_job('synthetic',1200)");
      await db.exec('reset role');
      assert.equal(await scalar('select status from synthetic_queue'),'claimed');
    });
  } finally {await db.close();}
});
