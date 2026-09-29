// Actual PostgreSQL functions and roles in memory; no network or hosted data.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH ?? process.env.PGLITE_MODULE;
test('PDF forward migration: permissions, real claims, fencing, completion and owner retries', { skip: !modulePath }, async t => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const migration = '202609290001_pdf_processing_safety.sql';
  const source = name => readFileSync(new URL(name, directory), 'utf8');
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const one = async (sql, values = []) => (await db.query(sql, values)).rows[0];
  const scalar = async (sql, values = []) => Object.values(await one(sql, values))[0];
  const role = async (name, account = null) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [account ? id(account) : '']);
    await db.query("select set_config('request.jwt.claim.role',$1,false)", [name]);
    await db.exec(`set role ${name}`);
  };
  const signatures = [
    'public.claim_pdf_processing_job_v2(text,integer)',
    'public.report_pdf_processing_progress_v2(uuid,uuid,integer,integer)',
    'public.complete_pdf_processing_job_v2(uuid,uuid,integer,jsonb)',
    'public.fail_pdf_processing_job_v2(uuid,uuid,text,text,integer,boolean)',
  ];
  const legacy = [
    'public.claim_pdf_processing_job(text,integer)',
    'public.report_pdf_processing_progress(uuid,integer,integer)',
    'public.complete_pdf_processing_job(uuid,integer,jsonb)',
    'public.fail_pdf_processing_job(uuid,text,text,integer,boolean)',
  ];
  const claim = () => one("select * from claim_pdf_processing_job_v2('synthetic-worker',1200)");
  const progress = (job, count = 1) => scalar('select report_pdf_processing_progress_v2($1,$2,$3,1200)', [job.id, job.lease_token, count]);
  const fail = (job, retryable = true) => scalar("select fail_pdf_processing_job_v2($1,$2,'synthetic','Synthetic error',null,$3)", [job.id, job.lease_token, retryable]);
  const pages = (job, count = 2) => Array.from({ length: count }, (_, index) => ({
    index: job.page_offset + index + 1, withinDocumentIndex: index + 1,
    attachmentId: job.attachment_id,
    storagePath: `posts/${job.post_id}/pages/${job.id}/${job.lease_token}/page_${job.page_offset + index + 1}.webp`,
    width: 600, height: 800, aspectRatio: 0.75,
  }));
  const complete = (job, output) => scalar('select complete_pdf_processing_job_v2($1,$2,$3,$4::jsonb)',
    [job.id, job.lease_token, output.length, JSON.stringify(output)]);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage; create schema realtime;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',owner uuid,owner_id text);
      create function storage.foldername(path text) returns text[] language sql immutable as $$select (string_to_array(path,'/'))[1:array_length(string_to_array(path,'/'),1)-1]$$;
      create table realtime.messages(id uuid primary key default gen_random_uuid(),extension text);
      create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
      alter table storage.objects enable row level security; alter table realtime.messages enable row level security;
      grant usage on schema public,auth,storage,realtime to anon,authenticated,service_role;
      grant all on storage.objects to authenticated,service_role; grant select on storage.objects to anon;
      grant select,insert on realtime.messages to authenticated;
      create publication supabase_realtime;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    `);
    for (const name of readdirSync(directory).filter(name => name.endsWith('.sql') && name < migration).sort()) {
      await db.exec(source(name).replace(/create extension if not exists pgcrypto;/i, ''));
    }
    for (const n of [1, 2]) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `pdf${n}@example.test`]);
      await db.query('insert into profiles(id,account_id,name,handle,headline,is_private) values($1,$2,$3,$4,$5,true)',
        [id(n + 10), id(n), `Synthetic ${n}`, `pdf${n}`, 'Synthetic']);
    }
    const category = await scalar('select id from portfolio_categories where profile_id=$1 limit 1', [id(11)]);
    await db.query("insert into projects(id,profile_id,category_id,title,summary) values($1,$2,$3,'Synthetic PDF','Test')", [id(100), id(11), category]);
    for (const n of [1, 2, 3]) {
      const path = `${id(11)}/synthetic-${n}.pdf`;
      await db.query("insert into storage.objects(bucket_id,name,metadata) values('project-media',$1,'{\"size\":8}')", [path]);
      await db.query(`insert into project_attachments(id,project_id,kind,file_name,display_name,extension,mime_type,size_bytes,type_label,storage_path,status,position)
        values($1,$2,'document','synthetic.pdf','Synthetic','pdf','application/pdf',8,'PDF',$1,'ready',$3)`, [path, id(100), n === 1 ? 0 : 1]);
      await db.query("update pdf_processing_jobs set id=$1,created_at='2026-01-01' where attachment_id=$2", [id(900 + n), path]);
    }
    await db.query("update pdf_processing_jobs set status='completed',page_count=1,page_metadata=$1::jsonb where id=$2", [JSON.stringify([{ storagePath: `posts/${id(100)}/pages/page_1.webp`, index: 1 }]), id(901)]);
    const oldRows = (await db.query('select * from pdf_processing_jobs order by id')).rows;
    const oldObjects = (await db.query('select * from storage.objects order by name')).rows;

    await t.test('forward application preserves existing queue/data and closes direct default grants', async () => {
      assert.equal(await scalar("select has_function_privilege('anon',$1,'EXECUTE')", [legacy[3]]), true);
      await db.exec(source(migration));
      await db.exec(source(migration));
      const current = (await db.query('select * from pdf_processing_jobs order by id')).rows;
      assert.deepEqual(current.map(({ lease_token, ...row }) => { assert.equal(lease_token, null); return row; }), oldRows);
      assert.deepEqual((await db.query('select * from storage.objects order by name')).rows, oldObjects);
      for (const browser of ['anon', 'authenticated']) {
        for (const signature of [...signatures, ...legacy, 'public.refresh_pdf_post_status(uuid)', 'public.enqueue_pdf_attachment()', 'public.mark_pdf_attachment_processing_on_claim()']) {
          assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')', [browser, signature]), false, `${browser}: ${signature}`);
        }
      }
      for (const signature of signatures) assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE')", [signature]), true);
      for (const signature of legacy) assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE')", [signature]), false);
      assert.equal(await scalar("select has_function_privilege('authenticated','retry_pdf_processing(text)','EXECUTE')"), true);
      assert.equal(await scalar("select has_function_privilege('anon','retry_pdf_processing(text)','EXECUTE')"), false);
    });

    await t.test('actual anonymous/authenticated worker calls are denied, including the prior private-job failure exploit', async () => {
      for (const browser of ['anon', 'authenticated']) {
        await role(browser, browser === 'authenticated' ? 2 : null);
        assert.equal(await scalar('select count(*)::int from projects'), 0);
        const calls = [
          ["select * from claim_pdf_processing_job_v2('unauthorized')", []],
          ['select report_pdf_processing_progress_v2($1,$2,1)', [id(902), id(999)]],
          ["select complete_pdf_processing_job_v2($1,$2,1,'[]')", [id(902), id(999)]],
          ["select fail_pdf_processing_job_v2($1,$2,'unauthorized','Unauthorized')", [id(901), id(999)]],
          ["select fail_pdf_processing_job($1,'unauthorized','Unauthorized')", [id(901)]],
        ];
        for (const [sql, values] of calls) await assert.rejects(db.query(sql, values), /permission denied/);
      }
      await role('service_role');
      assert.equal(await scalar('select status from pdf_processing_jobs where id=$1', [id(901)]), 'completed');
      await assert.rejects(db.query("select * from claim_pdf_processing_job('legacy-worker')"), /permission denied/);
    });

    let job;
    await t.test('service-role claim executes without ambiguous names and serializes tied source positions', async () => {
      job = await claim();
      assert.equal(job.id, id(902));
      assert.equal(job.page_offset, 1);
      assert.equal(job.attempt_count, 1);
      assert.match(job.lease_token, /^[0-9a-f-]{36}$/);
      assert.equal(await claim(), undefined, 'a tied later PDF must wait for the active earlier PDF');
      assert.equal(await progress(job, 1), true);
      assert.equal(await progress({ ...job, lease_token: id(999) }), false);
      assert.equal(await scalar('select processed_pages from pdf_processing_jobs where id=$1', [job.id]), 1);
    });

    await t.test('completion validates attempt paths and object existence, publishes pages, and is idempotent', async () => {
      const output = pages(job);
      await assert.rejects(complete(job, output), /missing object/);
      for (const page of output) await db.query("insert into storage.objects(bucket_id,name,metadata) values('project-media',$1,'{\"size\":8}')", [page.storagePath]);
      await assert.rejects(complete(job, [{ ...output[0], storagePath: `posts/${job.post_id}/pages/page_2.webp` }, output[1]]), /Invalid metadata/);
      assert.equal(await complete(job, output), true);
      assert.equal(await complete(job, output), true);
      assert.equal(await complete(job, [{ ...output[0], width: 900 }, output[1]]), false);
      assert.equal(await fail(job), false, 'a completed job cannot be failed by a late request');
      assert.equal(await progress(job), false);
      const attachment = await one('select status,metadata from project_attachments where id=$1', [job.attachment_id]);
      assert.equal(attachment.status, 'ready');
      assert.deepEqual(attachment.metadata.renderedPages, output);
      assert.equal(await scalar('select pdf_page_count from projects where id=$1', [job.post_id]), 3);
    });

    await t.test('expired attempts get fresh tokens and stale progress/completion/failure cannot change the successor', async () => {
      job = await claim();
      assert.equal(job.id, id(903));
      assert.equal(job.page_offset, 3);
      await db.query("update pdf_processing_jobs set lease_expires_at=now()-interval '1 second' where id=$1", [job.id]);
      assert.equal(await progress(job), false, 'an expired worker cannot extend its own expired lease');
      const successor = await claim();
      assert.notEqual(successor.lease_token, job.lease_token);
      assert.equal(successor.attempt_count, 2);
      assert.notEqual(pages(job)[0].storagePath, pages(successor)[0].storagePath);
      assert.equal(await progress(job), false);
      assert.equal(await complete(job, pages(job)), false);
      assert.equal(await fail(job), false);
      assert.equal(await progress(successor, 1), true);
      assert.equal(await fail(successor), true);
      job = successor;
    });

    await t.test('only the owner retries retryable failures, and retries invalidate the old attempt', async () => {
      await role('authenticated', 2);
      await assert.rejects(db.query('select retry_pdf_processing($1)', [job.attachment_id]), /not found/);
      await role('authenticated', 1);
      assert.equal((await scalar('select retry_pdf_processing($1)', [job.attachment_id])).state, 'processing');
      await role('service_role');
      const reset = await one('select status,lease_token,attempt_count from pdf_processing_jobs where id=$1', [job.id]);
      assert.deepEqual(reset, { status: 'queued', lease_token: null, attempt_count: 0 });
      assert.equal(await fail(job), false);
      const retried = await claim();
      assert.equal(retried.attempt_count, 1);
      assert.notEqual(retried.lease_token, job.lease_token);
      assert.equal(await fail(retried, false), true);
      await role('authenticated', 1);
      await assert.rejects(db.query('select retry_pdf_processing($1)', [job.attachment_id]), /replacing the source/);
      await role('service_role');
    });

    await t.test('exhausted expired jobs become retryable failures without corrupting completed pages', async () => {
      await db.query("update pdf_processing_jobs set status='processing',attempt_count=max_attempts,lease_token=$2,lease_expires_at=now()-interval '1 second' where id=$1", [job.id, job.lease_token]);
      assert.equal(await claim(), undefined);
      assert.deepEqual(await one('select status,error_code,is_retryable,lease_token from pdf_processing_jobs where id=$1', [job.id]), {
        status: 'failed', error_code: 'worker_timeout', is_retryable: true, lease_token: null,
      });
      assert.equal(await scalar('select status from pdf_processing_jobs where id=$1', [id(902)]), 'completed');
      assert.equal(await scalar("select count(*)::int from storage.objects where name like '%/pages/%'"), 2);
    });
  } finally { await db.close(); }
});
