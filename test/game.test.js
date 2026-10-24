import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { createCoins } from '../src/core/coin.js';
import { GAME_CONFIG } from '../src/core/config.js';
import { createPlayer, updatePlayer } from '../src/core/player.js';
import { GhostSystem } from '../src/ghost/ghost.js';
import { interpolateTrack } from '../src/ghost/replay.js';
import { createIdleInput, GAME_MODES } from '../src/shared/contracts.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values
  };
}

function advanceSeconds(game, seconds) {
  const input = createIdleInput();
  const frames = Math.ceil(seconds / 0.05);
  for (let frame = 0; frame < frames && game.state.mode === GAME_MODES.PLAYING; frame += 1) {
    game.update(0.05, input);
  }
}

test('first level keeps the five original coin positions', () => {
  assert.deepEqual(createCoins(1, { x: 480, y: 270 }), [
    { x: 365, y: 260, taken: false },
    { x: 478, y: 145, taken: false },
    { x: 605, y: 270, taken: false },
    { x: 703, y: 398, taken: false },
    { x: 262, y: 390, taken: false }
  ]);
});

test('later levels always create five separated coins away from spawn', () => {
  const coins = createCoins(8, GAME_CONFIG.start, () => 0.5);
  assert.equal(coins.length, GAME_CONFIG.coinCount);
  for (const coin of coins) {
    assert.ok(Math.hypot(coin.x - GAME_CONFIG.start.x, coin.y - GAME_CONFIG.start.y) >= 93);
    assert.equal(coin.taken, false);
  }
  for (let left = 0; left < coins.length; left += 1) {
    for (let right = left + 1; right < coins.length; right += 1) {
      assert.ok(Math.hypot(coins[left].x - coins[right].x, coins[left].y - coins[right].y) >= 80);
    }
  }
});

test('player movement is normalized, bounded, and switches input modes safely', () => {
  const player = createPlayer(GAME_CONFIG.start, GAME_CONFIG.playerRadius);
  const diagonal = {
    ...createIdleInput(),
    right: true,
    down: true
  };
  updatePlayer(player, diagonal, 1, GAME_CONFIG.arena, 100);
  assert.ok(Math.abs(Math.hypot(player.x - 480, player.y - 270) - 100) < 1e-9);

  const beforeConflict = { ...player };
  updatePlayer(player, {
    ...createIdleInput(),
    left: true,
    right: true,
    pointer: { active: true, x: 900, y: 500 }
  }, 1, GAME_CONFIG.arena, 100);
  assert.deepEqual(player, beforeConflict);

  updatePlayer(player, {
    ...createIdleInput(),
    pointer: { active: true, x: 900, y: 500 }
  }, 10, GAME_CONFIG.arena, 1000);
  assert.equal(player.x, GAME_CONFIG.arena.x + GAME_CONFIG.arena.w - player.radius - 4);
  assert.equal(player.y, GAME_CONFIG.arena.y + GAME_CONFIG.arena.h - player.radius - 4);

  updatePlayer(player, {
    ...createIdleInput(),
    pointer: { active: true, x: Number.NaN, y: 100 }
  }, 1, GAME_CONFIG.arena, 100);
  assert.ok(Number.isFinite(player.x) && Number.isFinite(player.y));
});

test('coin collection scores and emits feedback exactly once', () => {
  const game = new Game({ storage: createStorage() });
  game.advance();
  game.state.player.x = game.state.coins[0].x;
  game.state.player.y = game.state.coins[0].y;

  game.update(0, createIdleInput());
  assert.equal(game.getSnapshot().coinsGot, 1);
  assert.equal(game.getSnapshot().score, 100);
  assert.deepEqual(game.consumeEvents(), [{
    type: 'coin',
    x: game.state.coins[0].x,
    y: game.state.coins[0].y
  }]);

  game.update(0, createIdleInput());
  assert.equal(game.getSnapshot().coinsGot, 1);
  assert.equal(game.getSnapshot().score, 100);
  assert.deepEqual(game.consumeEvents(), []);
});

test('track replay uses time-based linear interpolation', () => {
  const position = interpolateTrack([
    { t: 0, x: 100, y: 200 },
    { t: 2, x: 300, y: 400 }
  ], 0.5);
  assert.deepEqual(position, { x: 150, y: 250 });
});

test('ghost system records a completed level and exposes stable identity', () => {
  const ghosts = new GhostSystem({ sampleInterval: 0.04 });
  ghosts.beginLevel({ level: 1, startPosition: { x: 10, y: 20 } });
  ghosts.recordPosition({ time: 1, position: { x: 20, y: 40 } });
  assert.deepEqual(ghosts.finishLevel({ time: 2, position: { x: 30, y: 60 } }), {
    id: 'ghost-1',
    sourceLevel: 1
  });
  const ghost = ghosts.getGhosts(1)[0];
  assert.deepEqual(
    { id: ghost.id, sourceLevel: ghost.sourceLevel, x: ghost.x, y: ghost.y },
    { id: 'ghost-1', sourceLevel: 1, x: 20, y: 40 }
  );
  const expectedTrail = [
    { x: 15.6, y: 31.2 },
    { x: 16.7, y: 33.4 },
    { x: 17.8, y: 35.6 },
    { x: 18.9, y: 37.8 }
  ];
  ghost.trail.forEach((position, index) => {
    assert.ok(Math.abs(position.x - expectedTrail[index].x) < 1e-9);
    assert.ok(Math.abs(position.y - expectedTrail[index].y) < 1e-9);
  });
});

test('game clears level one, creates a ghost, detects collision, and restarts', () => {
  const storage = createStorage();
  const game = new Game({ storage, random: () => 0.5 });
  game.advance();
  assert.equal(game.getSnapshot().mode, GAME_MODES.PLAYING);

  game.state.coinsGot = 3;
  advanceSeconds(game, 10.1);
  let snapshot = game.getSnapshot();
  assert.equal(snapshot.mode, GAME_MODES.PREP);
  assert.equal(snapshot.best, 2);
  assert.equal(snapshot.ghosts.length, 1);
  assert.equal(storage.values.get('ghosts-of-me-best'), '2');

  game.advance();
  snapshot = game.getSnapshot();
  assert.equal(snapshot.level, 2);
  assert.equal(snapshot.ghosts[0].sourceLevel, 1);

  advanceSeconds(game, 1.35);
  snapshot = game.getSnapshot();
  assert.equal(snapshot.mode, GAME_MODES.OVER);
  assert.equal(snapshot.outcome.reason, 'ghost');

  game.advance();
  snapshot = game.getSnapshot();
  assert.equal(snapshot.mode, GAME_MODES.PLAYING);
  assert.equal(snapshot.level, 1);
  assert.equal(snapshot.ghosts.length, 0);
});

test('game keeps timers finite and reports no grace period without ghosts', () => {
  const game = new Game({ storage: createStorage() });
  game.advance();
  game.update(Number.NaN, createIdleInput());
  const snapshot = game.getSnapshot();
  assert.equal(snapshot.elapsed, 0);
  assert.equal(snapshot.timeLeft, GAME_CONFIG.roundDuration);
  assert.equal(snapshot.graceLeft, 0);
});

test('round completion wins over a collision exactly at the ten-second deadline', () => {
  const ghostSystem = {
    reset() {},
    beginLevel() {},
    recordPosition() {},
    finishLevel() { return { id: 'ghost-1', sourceLevel: 1 }; },
    getGhosts() {
      return [{ id: 'ghost-1', sourceLevel: 1, x: GAME_CONFIG.start.x, y: GAME_CONFIG.start.y }];
    }
  };
  const game = new Game({ storage: createStorage(), ghostSystem });
  game.state.level = 2;
  game.beginLevel();
  game.state.coinsGot = GAME_CONFIG.coinGoal;
  game.state.elapsed = GAME_CONFIG.roundDuration - 0.05;

  game.update(0.05, createIdleInput());

  const snapshot = game.getSnapshot();
  assert.equal(snapshot.mode, GAME_MODES.PREP);
  assert.equal(snapshot.outcome.kind, 'clear');
});

test('game integrates with only the documented ghost system methods', () => {
  const history = [{ id: 'ghost-1', sourceLevel: 1, x: 100, y: 100 }];
  const ghostSystem = {
    reset() {},
    beginLevel() {},
    recordPosition() {},
    finishLevel() { return { id: 'ghost-2', sourceLevel: 2 }; },
    getGhosts() { return history.map((ghost) => ({ ...ghost })); }
  };
  const game = new Game({ storage: createStorage(), ghostSystem });
  game.state.level = 2;
  game.beginLevel();

  const snapshot = game.getSnapshot();
  assert.equal(snapshot.ghosts.length, 1);
  assert.equal(snapshot.graceLeft, GAME_CONFIG.gracePeriod);
  assert.equal(snapshot.points, 0);
  assert.equal(snapshot.pointCap, 0);
  assert.deepEqual(snapshot.skills, []);
  assert.deepEqual(snapshot.previewPaths, []);
});

test('restart resets score, level, ghost history, and outcome after timeout', () => {
  const game = new Game({ storage: createStorage() });
  game.advance();
  game.state.score = 200;
  game.state.elapsed = GAME_CONFIG.roundDuration - 0.05;
  game.update(0.05, createIdleInput());
  assert.equal(game.getSnapshot().mode, GAME_MODES.OVER);

  game.advance();
  const snapshot = game.getSnapshot();
  assert.equal(snapshot.mode, GAME_MODES.PLAYING);
  assert.equal(snapshot.level, 1);
  assert.equal(snapshot.score, 0);
  assert.equal(snapshot.ghosts.length, 0);
  assert.equal(snapshot.outcome, null);
});

test('invalid saved best value falls back to level one', () => {
  const storage = {
    getItem: () => 'Infinity',
    setItem() {}
  };
  assert.equal(new Game({ storage }).getSnapshot().best, 1);
});
