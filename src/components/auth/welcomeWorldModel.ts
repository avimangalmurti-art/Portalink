/** Decorative points use the existing illustrated map, not product destinations. */
export type WorldPoint = { x: number; y: number };
export type WorldIdea = WorldPoint & { id: number };
export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 280;
export const MAX_WORLD_IDEAS = 4;

export const WORLD_PLACES = [
  { id: 'san-francisco', x: 146, y: 97 }, { id: 'new-york', x: 308, y: 96 },
  { id: 'mexico-city', x: 265, y: 149 }, { id: 'rio', x: 400, y: 222 },
  { id: 'buenos-aires', x: 380, y: 251 }, { id: 'reykjavik', x: 500, y: 47 },
  { id: 'london', x: 541, y: 80 }, { id: 'paris', x: 564, y: 97 },
  { id: 'istanbul', x: 636, y: 113 }, { id: 'cairo', x: 633, y: 131 },
  { id: 'nairobi', x: 647, y: 190 }, { id: 'cape-town', x: 622, y: 232 },
  { id: 'mumbai', x: 777, y: 149 }, { id: 'beijing', x: 985, y: 113 },
  { id: 'tokyo', x: 1070, y: 132 }, { id: 'singapore', x: 908, y: 217 },
  { id: 'sydney', x: 1049, y: 259 },
] as const;

const connections = [
  [9, 10], [6, 7], [0, 1], [8, 9], [7, 8], [0, 2], [10, 11],
  [1, 6], [2, 3], [3, 4], [6, 5], [8, 12], [12, 15], [15, 13],
  [13, 14], [15, 16], [14, 0], [3, 11], [7, 12], [9, 15], [10, 12], [16, 4],
] as const;

/** Later discoveries arrive closer together; this is a visual story, not a dated timeline. */
export function worldArrival(index: number, total: number, duration = 8500) {
  const t = total <= 1 ? 0 : Math.max(0, Math.min(1, index / (total - 1)));
  return Math.round(duration * (1 - (1 - t) ** 2));
}

const wrap = (x: number) => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
const delta = (a: number, b: number) => wrap(b - a + WORLD_WIDTH / 2) - WORLD_WIDTH / 2;

/** Curves crossing the map seam get a matching segment at the other edge. */
export function worldPaths(from: WorldPoint, to: WorldPoint): string[] {
  const end = from.x + delta(from.x, to.x);
  const midX = (from.x + end) / 2;
  const midY = (from.y + to.y) / 2 - Math.min(18, Math.hypot(end - from.x, to.y - from.y) * .12);
  const offsets = [0];
  if (end < 0) offsets.push(WORLD_WIDTH);
  if (end > WORLD_WIDTH) offsets.push(-WORLD_WIDTH);
  return offsets.map(offset => `M${from.x + offset} ${from.y}Q${midX + offset} ${midY} ${end + offset} ${to.y}`);
}

export const WORLD_CONNECTIONS = connections.map(([a, b], index) => ({
  id: `${WORLD_PLACES[a].id}-${WORLD_PLACES[b].id}`,
  paths: worldPaths(WORLD_PLACES[a], WORLD_PLACES[b]),
  delay: worldArrival(index, connections.length),
}));

export const WORLD_INDUSTRIES = [
  { id: 'cultivate', x: 602, y: 165, delay: 300 },
  { id: 'make', x: 230, y: 76, delay: 2600 },
  { id: 'discover', x: 475, y: 95, delay: 4500 },
  { id: 'power', x: 715, y: 84, delay: 6000 },
  { id: 'compute', x: 936, y: 93, delay: 7100 },
  { id: 'create', x: 1017, y: 247, delay: 7900 },
  { id: 'explore', x: 377, y: 220, delay: 8500 },
] as const;

/** Recover a tap's position from the actually transformed two-copy map track. */
export function worldPointAt(client: WorldPoint, track: { left: number; top: number; width: number; height: number }): WorldPoint | null {
  if (![client.x, client.y, track.left, track.top, track.width, track.height].every(Number.isFinite)
    || track.width <= 0 || track.height <= 0) return null;
  const scale = track.width / 2 / WORLD_WIDTH;
  const imageHeight = WORLD_HEIGHT * scale;
  return {
    x: wrap((client.x - track.left) / scale),
    y: Math.max(0, Math.min(WORLD_HEIGHT, (client.y - track.top + (imageHeight - track.height) / 2) / scale)),
  };
}

export function ideaConnections(idea: WorldPoint) {
  return [...WORLD_PLACES].sort((a, b) =>
    Math.hypot(delta(idea.x, a.x), a.y - idea.y) - Math.hypot(delta(idea.x, b.x), b.y - idea.y)
  ).slice(0, 3).flatMap(place => worldPaths(idea, place));
}

export function addWorldIdea(previous: readonly WorldIdea[], idea: WorldIdea) {
  return [...previous.slice(-(MAX_WORLD_IDEAS - 1)), idea];
}
