import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const { positionMessageContext } = sourceModule('src/components/messages/messageContextPosition.ts');
const bounds = { left: 20, right: 220, top: 80, bottom: 600 };
const anchor = { left: 38, right: 190, top: 260, bottom: 310 };

test('the preview aligns with its message within an offset viewport', () => {
  const position = positionMessageContext({ anchor, bounds, stackHeight: 180, previewOffset: 56, isMine: true });
  assert.deepEqual({ ...position }, { top: 124, leftInset: 18, rightInset: 30 });
});

test('the full stack stays within the visible height when there is room', () => {
  const options = { bounds, stackHeight: 180, previewOffset: 56, isMine: false };
  assert.equal(positionMessageContext({ ...options, anchor: { ...anchor, top: 95, bottom: 145 } }).top, 0);
  assert.equal(positionMessageContext({ ...options, anchor: { ...anchor, top: 560, bottom: 610 } }).top, 340);
  assert.equal(positionMessageContext({ ...options, anchor, bounds: { ...bounds, bottom: 220 } }).top, 0);
});

test('side alignment yields to the reaction row on narrow or panned viewports', () => {
  const options = { bounds, stackHeight: 180, previewOffset: 56 };
  const incoming = { ...anchor, left: 180, right: 210 };
  const outgoing = { ...anchor, left: 30, right: 60 };
  assert.equal(positionMessageContext({ ...options, anchor: incoming, isMine: false }).leftInset, 40);
  assert.equal(positionMessageContext({ ...options, anchor: outgoing, isMine: true }).rightInset, 40);
  assert.equal(positionMessageContext({ ...options, anchor: incoming, bounds: { ...bounds, right: 150 }, isMine: false }).leftInset, 0);
  assert.equal(positionMessageContext({ ...options, anchor: { ...anchor, left: 10 }, isMine: false }).leftInset, 0);
});
