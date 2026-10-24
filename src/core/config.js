export const GAME_CONFIG = Object.freeze({
  canvas: Object.freeze({ width: 960, height: 540 }),
  arena: Object.freeze({ x: 39, y: 32, w: 882, h: 476 }),
  start: Object.freeze({ x: 480, y: 270 }),
  roundDuration: 10,
  speed: 350,
  coinCount: 5,
  coinGoal: 3,
  coinRadius: 14,
  playerRadius: 17,
  ghostRadius: 17,
  gracePeriod: 1.25,
  sampleInterval: 0.045,
  storageKey: 'ghosts-of-me-best'
});

export const GHOST_COLORS = Object.freeze([
  '#ff7ba8', '#ba9bff', '#ff9b71', '#78b9ff', '#fe88da', '#a6e986'
]);

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
