import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { createCoins } from '../src/core/coin.js';
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
  assert.equal(snapshot.mode, GAME_MODES.CLEAR);
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
