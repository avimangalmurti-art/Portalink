import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const { packDesktopPages } = sourceModule('src/components/media/useDesktopPagePacking.ts', { react: {} });
const pack = (heights, columns) => JSON.parse(JSON.stringify(packDesktopPages(
  heights.map(height => ({ height: Math.abs(height), fullWidth: height < 0 })), columns,
)));

test('portrait and landscape pages share columns without leaving holes under the shorter pages', () => {
  const result = pack([480, 220, 220, 220, 220, 220, 220], 3);
  assert.deepEqual(result.positions, [
    { column: 0, top: 0 }, { column: 1, top: 0 }, { column: 2, top: 0 },
    { column: 1, top: 222 }, { column: 2, top: 222 },
    { column: 1, top: 444 }, { column: 2, top: 444 },
  ]);
  assert.equal(result.height, 664);
});

test('full-width loading or retry notices clear the columns and preserve page order', () => {
  assert.deepEqual(pack([100, 80, -50, 80, 80], 2), {
    positions: [
      { column: 0, top: 0 }, { column: 1, top: 0 }, { column: 0, top: 102 },
      { column: 0, top: 154 }, { column: 1, top: 154 },
    ],
    height: 234,
  });
  assert.deepEqual(pack([], 3), { positions: [], height: 0 });
});
