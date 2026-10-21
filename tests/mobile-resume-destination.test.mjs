import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const { mobileResumeDestination, MobileResumeSession } = sourceModule('src/presentation/mobile/mobileResumeState.ts');
const path = '/p/creator/c/portal/project';
const record = (query, entries) => ({ version: 1, accountId: 'account', savedAt: Date.now(), path: path + query,
  reader: { path, entries } });
const entry = (key, state) => ({ key: `workspace:${key}`, state });

test('cold focused PDF uses the current live page instead of the original shared page', () => {
  const saved = record('?media=pdf&page=1&view=page', [entry('document:project:pdf:live', { focusedPageNumber: 7 })]);
  assert.equal(mobileResumeDestination(saved), `${path}?media=pdf&page=7&view=page`);
});
test('rendered PDF index is converted to a one-based URL exactly once', () => {
  const saved = record('?media=pdf&page=1&view=page', [entry('document:project:pdf:rendered', { focusedPageNumber: 6 })]);
  assert.equal(mobileResumeDestination(saved), `${path}?media=pdf&page=7&view=page`);
});
test('latest renderer parent wins after a live-to-rendered handover', () => {
  const saved = record('?media=pdf&page=1&view=page', [entry('document:project:pdf:live', { focusedPageNumber: 2 }), entry('document:project:pdf:rendered', { focusedPageNumber: 6 })]);
  assert.equal(mobileResumeDestination(saved), `${path}?media=pdf&page=7&view=page`);
});
test('vertical reading retains the chosen file and lets measured scroll win over the old page anchor', () => {
  const saved = record('?media=pdf&page=1', [entry('document:project:pdf:live', { scrollTop: 660 })]);
  assert.equal(mobileResumeDestination(saved), `${path}?media=pdf`);
});
test('attachment changes after opening a link use the current file and its own page', () => {
  const saved = record('?media=old&page=1&view=page', [entry('project:project', { activeAttachmentId: 'new' }), entry('document:project:new:live', { focusedPageNumber: 3 })]);
  assert.equal(mobileResumeDestination(saved), `${path}?media=new&page=3&view=page`);
});
test('image focus and returning to overview retire the stale linked focus', () => {
  assert.equal(mobileResumeDestination(record('?media=image-1&page=1&view=page', [entry('images:project', { focusedPageId: 'image-3' })])), `${path}?media=image-3&page=1&view=page`);
  assert.equal(mobileResumeDestination(record('?media=pdf&page=1&view=page', [entry('document:project:pdf:live', { focusedPageNumber: null })])), `${path}?media=pdf`);
});
test('ordinary routes and missing or unrelated reader memory retain the original safe destination', () => {
  for (const saved of [{ path: '/saved' }, record('', []), { path: `${path}?media=pdf&page=1`, reader: { path: '/p/other/c/portal/project', entries: [entry('document:project:pdf:live', { focusedPageNumber: 7 })] } }]) {
    assert.equal(mobileResumeDestination(saved), saved.path);
  }
});
test('an explicit incoming project link never reads or reconciles the saved cold destination', () => {
  const input = { mobile: true, authReady: true, accountId: 'account', pathname: path, search: '?media=pdf&page=1&view=page', locationKey: 'explicit' };
  const session = new MobileResumeSession(input);
  let reads = 0;
  assert.equal(session.update(input, () => { reads++; return record('?media=pdf&page=7&view=page', []); }), null);
  assert.equal(reads, 0);
  assert.equal(session.launchRecord, null);
});
