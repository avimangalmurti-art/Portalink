import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';
const world = sourceModule('src/components/auth/welcomeWorldModel.ts');

test('growth accelerates with bounded, ordered arrivals and stable city identities', () => {
  const times = Array.from({ length: 10 }, (_, i) => world.worldArrival(i, 10));
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  assert.equal(times[0], 0); assert.equal(times.at(-1), 8500);
  assert.ok(gaps.every((gap, i) => gap > 0 && (!i || gap <= gaps[i - 1])));
  assert.equal(world.worldArrival(-1, 10), 0); assert.equal(world.worldArrival(100, 10), 8500);
  assert.equal(world.worldArrival(0, 1), 0);
  assert.equal(new Set(world.WORLD_PLACES.map(p => p.id)).size, world.WORLD_PLACES.length);
  assert.ok(world.WORLD_CONNECTIONS.every(link => link.paths.length && Number.isFinite(link.delay)));
});

test('a moving map tap stays anchored at the same illustrated place through wrapping and vertical cropping', () => {
  const a = world.worldPointAt({ x: 210, y: 456 }, { left: -1744.285714, top: 0, width: 7817.142856, height: 912 });
  assert.ok(Math.abs(a.x - 600) < .001); assert.ok(Math.abs(a.y - 140) < .001);
  const b = world.worldPointAt({ x: 210, y: 456 }, { left: -5652.857142, top: 0, width: 7817.142856, height: 912 });
  assert.ok(Math.abs(b.x - a.x) < .001); assert.ok(Math.abs(b.y - a.y) < .001);
  const wide = world.worldPointAt({ x: 1200, y: 150 }, { left: 0, top: 0, width: 4800, height: 300 });
  assert.equal(wide.x, 600); assert.equal(wide.y, 140);
  assert.equal(world.worldPointAt({ x: NaN, y: 0 }, { left: 0, top: 0, width: 2400, height: 280 }), null);
  assert.equal(world.worldPointAt({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 280 }), null);
});

test('connections take the short route across the world seam and render its matching edge segment', () => {
  const crossing = world.worldPaths({ x: 1070, y: 132 }, { x: 146, y: 97 });
  assert.equal(crossing.length, 2);
  assert.ok(crossing[0].startsWith('M1070 132Q')); assert.ok(crossing[0].endsWith('1346 97'));
  assert.ok(crossing[1].startsWith('M-130 132Q')); assert.ok(crossing[1].endsWith('146 97'));
  assert.equal(world.worldPaths({ x: 500, y: 50 }, { x: 600, y: 100 }).length, 1);
  assert.ok(world.ideaConnections({ x: 1199, y: 130 }).length >= 3);
});

test('visitor ideas stay local, retain stable ids and are bounded without mutating earlier state', () => {
  const previous = [];
  let current = previous;
  for (let id = 1; id <= 8; id++) current = world.addWorldIdea(current, { id, x: id, y: 100 });
  assert.equal(previous.length, 0); assert.equal(current.length, world.MAX_WORLD_IDEAS);
  assert.deepEqual(Array.from(current, idea => idea.id), [5, 6, 7, 8]);
});
