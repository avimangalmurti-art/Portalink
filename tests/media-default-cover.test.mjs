import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { hookHarness } from './helpers/hook-harness.mjs';
import { sourceModule } from './helpers/source-module.mjs';

const assets = sourceModule('src/features/publishing/assetTypes.ts');
const pdfBytes = readFileSync(new URL('./fixtures/cover-thumbnails/report.pdf', import.meta.url));
const file = (name, type) => new File(['original bytes'], name, { type });
const pdf = name => new File([pdfBytes], name, { type: 'application/pdf' });
const image = name => file(name, 'image/png');

function harness() {
  const created = [], revoked = [];
  class PreviewURL extends URL {
    static createObjectURL(blob) { const value = `blob:prepared-${created.length + 1}`; created.push({ blob, value }); return value; }
    static revokeObjectURL(value) { revoked.push(value); }
  }
  const h = hookHarness(new URL('../src/features/publishing/useMediaPreparation.ts', import.meta.url), 'useMediaPreparation', {
    media: { getUploadCapability: async () => ({ isAvailable: true, reason: 'Controlled test service' }) },
  }, {}, undefined, undefined, {
    './assetTypes': assets,
    '../../utils/imageMetadata': { readImageDimensions: async () => ({ widthPixels: 1200, heightPixels: 900 }) },
  }, { URL: PreviewURL });
  return { ...h, created, revoked,
    get value() { return h.value; },
    async select(files, replaceId) { h.value.select(files, replaceId); await h.flush(); },
  };
}

test('a newly selected PDF explicitly defaults to page one without changing the original file', async t => {
  const h = harness(); t.after(() => h.dispose());
  const original = pdf('first.pdf'); await h.select([original]);
  assert.equal(h.value.cover.id, h.value.items[0].id);
  assert.equal(h.value.cover.metadata.coverPageNumber, 1);
  assert.equal(h.value.cover.file, original);
  assert.ok(Buffer.from(await h.value.cover.file.arrayBuffer()).equals(pdfBytes));
  assert.equal(h.value.cover.capability, 'native');
  assert.equal(h.created[0].blob, original); assert.equal(h.value.cover.previewUrl, h.created[0].value);
});

test('non-cover source files do not displace the first eligible PDF and its default remains stable when files are appended', async t => {
  const h = harness(); t.after(() => h.dispose());
  await h.select([file('notes.txt', 'text/plain'), file('voice.mp3', 'audio/mpeg')]);
  assert.equal(h.value.cover, null);
  await h.select([pdf('first.pdf'), pdf('second.pdf')]);
  const coverId = h.value.cover.id;
  assert.equal(h.value.cover.fileName, 'first.pdf'); assert.equal(h.value.cover.metadata.coverPageNumber, 1);
  await h.select([image('later.png')]);
  assert.equal(h.value.cover.id, coverId); assert.equal(h.value.cover.metadata.coverPageNumber, 1);
  assert.deepEqual(Array.from(h.value.items, item => item.fileName), ['notes.txt', 'voice.mp3', 'first.pdf', 'second.pdf', 'later.png']);
});

test('manual cover, selected PDF page and crop survive append, reorder and unrelated removal', async t => {
  const h = harness(); t.after(() => h.dispose());
  await h.select([pdf('first.pdf'), pdf('chosen.pdf')]);
  const [first, chosen] = h.value.items;
  const frame = { x: .2, y: .8, zoom: 2, aspectRatio: 3 / 4 };
  h.value.setCoverPage(chosen.id, 4, 9, frame); await h.flush();
  await h.select([image('later.png')]);
  h.value.reorder(1, 0); await h.flush();
  h.value.remove(first.id); await h.flush();
  assert.equal(h.value.cover.id, chosen.id); assert.equal(h.value.cover.metadata.coverPageNumber, 4);
  assert.equal(h.value.cover.metadata.coverFrame, frame);
  assert.deepEqual(Array.from(h.value.items, item => item.fileName), ['chosen.pdf', 'later.png']);
  assert.deepEqual(Array.from(h.value.items, item => item.order), [0, 1]);
});

test('a manual image cover and crop survive later PDF selection without assigning it a page', async t => {
  const h = harness(); t.after(() => h.dispose());
  await h.select([pdf('first.pdf'), image('chosen.png')]);
  const chosen = h.value.items[1], frame = { x: .7, y: .3, zoom: 1.5, aspectRatio: 1 };
  h.value.setCover(chosen.id); h.value.setCoverFrame(chosen.id, frame); await h.flush();
  await h.select([pdf('later.pdf')]); h.value.reorder(1, 0); await h.flush();
  assert.equal(h.value.cover.id, chosen.id); assert.equal(h.value.cover.metadata.coverFrame, frame);
  assert.equal(h.value.cover.metadata.coverPageNumber, undefined);
});

test('replacing or removing a PDF cover defaults the new source to page one', async t => {
  const h = harness(); t.after(() => h.dispose());
  await h.select([pdf('first.pdf'), pdf('next.pdf')]);
  const first = h.value.cover;
  h.value.setCoverPage(first.id, 3, 5, { x: .1, y: .2, zoom: 2 }); await h.flush();
  await h.select([pdf('replacement.pdf')], first.id);
  assert.equal(h.value.cover.fileName, 'replacement.pdf'); assert.equal(h.value.cover.metadata.coverPageNumber, 1);
  assert.equal(h.value.cover.metadata.coverFrame, undefined, 'A different file does not inherit an unrelated crop.');
  assert.ok(h.revoked.includes(first.previewUrl));
  h.value.remove(h.value.cover.id); await h.flush();
  assert.equal(h.value.cover.fileName, 'next.pdf'); assert.equal(h.value.cover.metadata.coverPageNumber, 1);
});

function savedItem(id, original, overrides = {}) {
  const detected = assets.detectAsset(original);
  return { id, file: original, fileName: original.name, displayTitle: original.name, sizeBytes: original.size, mimeType: original.type,
    ...detected, processingState: assets.initialProcessingState(detected.capability), order: 0, isCover: false, previewUrl: null, ...overrides };
}

test('restoring a draft with no cover repairs the first eligible PDF and its page without mutating the saved snapshot', async t => {
  const h = harness(); t.after(() => h.dispose());
  const saved = [savedItem('notes', file('notes.txt', 'text/plain')), savedItem('pdf', pdf('first.pdf'), { order: 1 })];
  h.value.restore(saved); await h.flush();
  assert.equal(h.value.cover.id, 'pdf'); assert.equal(h.value.cover.metadata.coverPageNumber, 1);
  assert.equal(h.value.cover.file, saved[1].file);
  assert.deepEqual(Array.from(h.value.items, item => item.id), ['notes', 'pdf']);
  assert.deepEqual(Array.from(h.value.items, item => item.order), [0, 1]);
  assert.equal(saved[1].isCover, false); assert.equal(saved[1].metadata, undefined); assert.equal(saved[1].previewUrl, null);
  assert.ok(h.value.cover.previewUrl.startsWith('blob:'));
});

test('restoring an explicit cover preserves its file, page, crop and order while replacing temporary URLs', async t => {
  const h = harness(); t.after(() => h.dispose());
  await h.select([image('old.png')]); const oldUrl = h.value.cover.previewUrl;
  const frame = { x: .8, y: .1, zoom: 2.4, aspectRatio: 3 / 4 };
  const saved = [savedItem('first', pdf('first.pdf')), savedItem('manual', pdf('chosen.pdf'), { order: 1, isCover: true, metadata: { pageCount: 8, coverPageNumber: 5, coverFrame: frame } })];
  h.value.restore(saved); await h.flush();
  assert.equal(h.value.cover.id, 'manual'); assert.equal(h.value.cover.file, saved[1].file);
  assert.equal(h.value.cover.metadata, saved[1].metadata); assert.equal(h.value.cover.metadata.coverPageNumber, 5);
  assert.equal(h.value.cover.metadata.coverFrame, frame);
  assert.deepEqual(Array.from(h.value.items, item => item.id), ['first', 'manual']);
  assert.ok(h.revoked.includes(oldUrl));
});

test('restoring source-only files cannot invent a PDF page or preview and a converted DOCX remains honest', async t => {
  const h = harness(); t.after(() => h.dispose());
  h.value.restore([savedItem('text', file('notes.txt', 'text/plain'))]); await h.flush();
  assert.equal(h.value.cover, null); assert.equal(h.value.items[0].previewUrl, null);
  const original = file('work.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  await h.select([original]);
  const word = h.value.items.find(item => item.file === original);
  assert.equal(word.family, 'document'); assert.equal(word.capability, 'converted');
  assert.equal(word.processingState, 'conversion-required'); assert.equal(word.previewUrl, null);
  assert.equal(word.metadata?.coverPageNumber, undefined);
  assert.equal(assets.mediaKindFor(word.family, word.capability), 'unknown');
  assert.equal(word.file, original, 'The original Word file is retained without claiming a rendered page.');
  assert.equal(h.value.cover, null);
  assert.equal(assets.canBeCover(word.family, word.capability), false);
});

test('Word stays attached when a PDF or image supplies its cover, including stale cover callbacks', async t => {
  for (const separateCover of [pdf('cover.pdf'), image('cover.png')]) {
    const h = harness(); t.after(() => h.dispose());
    const original = file('work.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    await h.select([original]);
    const word = h.value.items[0];
    assert.equal(h.value.cover, null);
    await h.select([pdf('earlier.pdf'), separateCover]);
    const chosen = h.value.items[2];
    h.value.setCover(chosen.id); await h.flush();
    const frame = { x: .2, y: .8, zoom: 1.5, aspectRatio: 1 };
    h.value.setCoverFrame(chosen.id, frame); await h.flush();
    h.value.setCover(word.id); h.value.setCoverPage(word.id, 2, 3); await h.flush();
    assert.equal(h.value.cover.id, chosen.id); assert.equal(h.value.cover.metadata.coverFrame, frame);
    assert.equal(h.value.items[0].file, original); assert.equal(h.value.items[0].previewUrl, null);
    assert.equal(h.value.items[0].metadata?.coverPageNumber, undefined);
    assert.equal(h.value.items[0].isCover, false);
    assert.equal(h.value.cover.family === 'document' ? h.value.cover.metadata.coverPageNumber : undefined, chosen.family === 'document' ? 1 : undefined);
  }
});

test('restored nominal Word cover is cleared without altering its source or the saved draft', async t => {
  const h = harness(); t.after(() => h.dispose());
  const original = file('work.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const word = savedItem('word', original, { isCover: true });
  h.value.restore([word]); await h.flush();
  assert.equal(h.value.cover, null); assert.equal(h.value.items[0].file, original);
  assert.equal(h.value.items[0].isCover, false); assert.equal(word.isCover, true);
  h.value.restore([word, savedItem('pdf', pdf('cover.pdf'), { order: 1 })]); await h.flush();
  assert.equal(h.value.cover.id, 'pdf'); assert.equal(h.value.cover.metadata.coverPageNumber, 1);
  assert.equal(h.value.items[0].file, original); assert.equal(word.isCover, true);
});
