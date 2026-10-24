export const GAME_MODES = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  CLEAR: 'clear',
  OVER: 'over'
});

/**
 * @typedef {{x: number, y: number, radius: number}} PlayerSnapshot
 * @typedef {{x: number, y: number, taken: boolean}} CoinSnapshot
 * @typedef {{x: number, y: number}} Position
 * @typedef {{id: string, sourceLevel: number, x: number, y: number, trail?: Position[]}} GhostSnapshot
 * @typedef {{x: number, y: number, w: number, h: number}} ArenaSnapshot
 * @typedef {{
 *   mode: 'menu'|'playing'|'clear'|'over',
 *   level: number,
 *   elapsed: number,
 *   timeLeft: number,
 *   score: number,
 *   best: number,
 *   coinsGot: number,
 *   goal: number,
 *   player: PlayerSnapshot,
 *   coins: CoinSnapshot[],
 *   ghosts: GhostSnapshot[],
 *   arena: ArenaSnapshot,
 *   graceLeft: number,
 *   outcome: null|Record<string, unknown>
 * }} GameSnapshot
 */

export function createIdleInput() {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    pointer: { active: false, x: 0, y: 0 }
  };
}
