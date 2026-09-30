import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/services/supabase/mediaProcessingReads.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(rows = {}) {
  const calls = [], imports = [];
  const client = { from(table) {
    const call = { table };
    return { select(columns) { call.columns = columns; return this; }, async in(column, ids) {
      calls.push({ ...call, column, ids: [...ids] });
      return rows[table] ?? { data: [], error: null };
    } };
  } };
  class ProcessingServiceError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const exports = {};
  vm.runInNewContext(source, { exports, require(name) {
    imports.push(name);
    if (name === './client') return { requireSupabase: () => client };
    if (name === '../../types/publishing') return { ProcessingServiceError };
    throw new Error(`A processing read must not import ${name}`);
  } });
  return { service: exports.supabaseMediaProcessingReadService, calls, imports };
}

test('processing capability and empty status reads need no uploader, mutations or network reads', async () => {
  const h = harness();
  const capability = await h.service.getProcessingCapability();
  assert.equal(capability.isAvailable, true);
  assert.equal(capability.canRetry, true);
  assert.equal(capability.refreshIntervalSeconds, 3);
  assert.equal((await h.service.getProcessingStatus([])).length, 0);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.imports, ['../../types/publishing', './client']);
});

test('the shared processing reader preserves document/video states and queries only requested attachments', async () => {
  const h = harness({
    pdf_processing_jobs: { error: null, data: [
      { attachment_id: 'pdf', status: 'completed', processed_pages: 8, page_count: 8, updated_at: 'one' },
      { attachment_id: 'failed', status: 'failed', processed_pages: 2, page_count: 9, error_message: 'Decoder failed', is_retryable: true, updated_at: 'two' },
    ] },
    video_processing_jobs: { error: null, data: [
      { attachment_id: 'video', status: 'queued', updated_at: 'three' },
      { attachment_id: 'bad-video', status: 'failed', error_message: 'Video decoder failed', is_retryable: false, updated_at: 'four' },
    ] },
  });
  const ids = ['pdf', 'failed', 'video', 'bad-video'];
  const records = await h.service.getProcessingStatus(ids);
  assert.equal(records.length, 4);
  assert.equal(records[0].state, 'ready');
  assert.equal(records[0].pageCount, 8);
  assert.equal(records[0].processedPages, 8);
  assert.equal(records[1].state, 'processing-failed');
  assert.equal(records[1].isRetryable, true);
  assert.equal(records[1].message, 'Decoder failed');
  assert.equal(records[2].state, 'processing');
  assert.equal(records[2].message, 'Video queued for conversion.');
  assert.equal(records[3].isRetryable, false);
  assert.equal(records[3].updatedAt, 'four');
  assert.deepEqual(h.calls.map(call => [call.table, call.column, call.ids]), [
    ['pdf_processing_jobs', 'attachment_id', ids], ['video_processing_jobs', 'attachment_id', ids],
  ]);
});

test('existing staged-deployment and PDF guest policies remain unchanged while other failures surface', async () => {
  for (const code of ['42P01', 'PGRST205', '42501']) {
    const h = harness({ pdf_processing_jobs: { data: null, error: { code, message: 'Document status unavailable' } },
      video_processing_jobs: { error: null, data: [{ attachment_id: 'video', status: 'completed' }] } });
    assert.equal((await h.service.getProcessingStatus(['video']))[0].state, 'ready');
  }
  for (const code of ['42P01', 'PGRST205']) {
    assert.equal((await harness({ video_processing_jobs: { data: null, error: { code } } }).service.getProcessingStatus(['video'])).length, 0);
  }
  for (const table of ['pdf_processing_jobs', 'video_processing_jobs']) {
    const h = harness({ [table]: { data: null, error: { code: 'network', message: 'Offline' } } });
    await assert.rejects(h.service.getProcessingStatus(['file']), error => error.code === 'network' && error.message === 'Offline');
  }
  await assert.rejects(harness({ video_processing_jobs: { data: null, error: { code: '42501', message: 'Not permitted' } } }).service.getProcessingStatus(['video']), /Not permitted/);
});
