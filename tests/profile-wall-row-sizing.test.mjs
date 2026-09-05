import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/profile/JustifiedImageWall.tsx', import.meta.url), 'utf8');

test('the incomplete profile row inherits the preceding row height when it fits', () => {
  assert.match(source, /const precedingRowHeight = rows\[rows\.length - 1\]\?\.height \?\? trailingRowHeight;/);
  assert.match(source, /const height = Math\.min\(precedingRowHeight, maximumFittingHeight\);/);
});

test('an inherited final-row height is capped before it can overflow', () => {
  assert.match(source, /const available = width - GAP \* \(current\.length - 1\);/);
  assert.match(source, /const maximumFittingHeight = available \/ ratioSum;/);
  assert.match(source, /width: height \* entry\.ratio/);
});
