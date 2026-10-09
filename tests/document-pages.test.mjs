import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDocumentPages } from '../src/features/media/documentPages.mjs';
test('publish caps rendering at 60 pages, preserves failed fallback and marks the remainder', async () => {
  let active = 0, peak = 0;
  const uploaded = [];
  const result = await prepareDocumentPages({ count: 65,
    render: async (number, size) => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; if (number === 2) throw Error('bad page'); return { blob: new Blob(), width: size, height: size }; },
    path: async (number, size) => `${number}/${size}`, upload: async path => uploaded.push(path) });
  assert.equal(peak, 1); assert.equal(result.pages.length, 59);
  assert.deepEqual(result.failed, [2]); assert.equal(result.backfillFrom, 61);
  assert.deepEqual(result.pages[0].variants.map(v => v.size), [800,1600]);
  assert.equal(uploaded.length, 118); assert.ok(!uploaded.some(p => p.startsWith('61/')));
});
test('failed variant upload leaves its page absent so PDF fallback remains, and later pages continue', async () => {
  const result = await prepareDocumentPages({ count: 2, render: async () => ({ blob: new Blob(), width: 1, height: 1 }), path: async (n,s) => `${n}/${s}`, upload: async path => { if(path==='1/1600') throw Error(); } });
  assert.deepEqual(result.failed,[1]); assert.deepEqual(result.pages.map(p=>p.number),[2]); assert.equal(result.backfillFrom,null);
  await assert.rejects(prepareDocumentPages({count:5001}), /Invalid PDF page count/);
});

test('partial previews preserve page numbers, failed slots and pages beyond the publish cap', async () => {
  const {documentPageSlots}=await import('../src/features/media/documentPages.mjs');
  const first={withinDocumentIndex:1,sourceUrl:'first.webp'};
  const third={withinDocumentIndex:3,sourceUrl:'third.webp'};
  const slots=documentPageSlots([first,third],65,'document');
  assert.equal(slots.length,65);
  assert.equal(slots[0],first);
  assert.equal(slots[2],third);
  assert.equal(slots[1].sourceUrl,'');
  assert.equal(slots[64].withinDocumentIndex,65);
  assert.equal(slots[64].sourceUrl,'');
  assert.deepEqual(documentPageSlots([],65,'document'),[]);
});
