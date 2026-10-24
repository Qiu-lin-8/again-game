import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { GhostSystem } from '../src/ghost/ghost.js';
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

function advanceUntilPlaying(game) {
  for (let i = 0; i < 200; i += 1) {
    game.update(0.05, createIdleInput());
    if (game.state.mode === GAME_MODES.PLAYING) return;
  }
}

test('collecting the 4th and 5th coins earns +1 and +2 points', () => {
  const game = new Game({ storage: createStorage(), random: () => 0.5 });
  game.advance();
  assert.equal(game.state.coins.length, 5);

  for (const coin of game.state.coins) {
    if (coin.taken) continue;
    game.state.player.x = coin.x;
    game.state.player.y = coin.y;
    game.update(0.016, createIdleInput());
  }

  assert.equal(game.getSnapshot().points, 3);
});

test('points are soft-capped at the point cap', () => {
  const ghosts = new GhostSystem();
  ghosts.addPoints(5);
  ghosts.addPoints(5);
  assert.equal(ghosts.getPoints(), 9);
  assert.equal(ghosts.getPointCap(), 9);
});

test('magnet doubles the coin radius and expires at the end of the level', () => {
  const ghosts = new GhostSystem();
  assert.equal(ghosts.getCoinRadiusMult(), 1);

  ghosts.addPoints(3);
  assert.deepEqual(ghosts.buySkill('magnet'), { ok: true });
  assert.equal(ghosts.getCoinRadiusMult(), 2);

  // 准备阶段买好后，磁铁应延续到下一关（beginLevel 不清除）
  ghosts.beginLevel({ level: 2, startPosition: { x: 0, y: 0 } });
  assert.equal(ghosts.getCoinRadiusMult(), 2);

  // 该关结束，磁铁失效
  ghosts.recordPosition({ time: 5, position: { x: 100, y: 0 } });
  ghosts.finishLevel({ time: 10, position: { x: 200, y: 0 } });
  assert.equal(ghosts.getCoinRadiusMult(), 1);
});

test('forgive removes the oldest ghost', () => {
  const ghosts = new GhostSystem();
  function run(level, y) {
    ghosts.beginLevel({ level, startPosition: { x: 0, y } });
    ghosts.recordPosition({ time: 5, position: { x: 100, y } });
    ghosts.finishLevel({ time: 10, position: { x: 200, y } });
  }
  run(1, 0);
  run(2, 100);
  run(3, 200);
  assert.equal(ghosts.count, 3);

  ghosts.addPoints(4);
  assert.deepEqual(ghosts.buySkill('forgive'), { ok: true });
  assert.equal(ghosts.count, 2);
  assert.deepEqual(ghosts.getGhosts(5).map((ghost) => ghost.sourceLevel), [2, 3]);
});

test('shield is a one-shot consume', () => {
  const ghosts = new GhostSystem();
  ghosts.addPoints(5);
  assert.deepEqual(ghosts.buySkill('shield'), { ok: true });
  assert.equal(ghosts.getPoints(), 0);
  assert.equal(ghosts.getSkills().find((skill) => skill.id === 'shield').active, true);

  assert.equal(ghosts.consumeShield(), true);
  assert.equal(ghosts.getSkills().find((skill) => skill.id === 'shield').active, false);
  assert.equal(ghosts.consumeShield(), false);
});

test('clearing a level enters prep, lets you buy, then advances to the next level', () => {
  const game = new Game({ storage: createStorage(), random: () => 0.5 });
  game.advance();
  game.state.coinsGot = 3;
  game.ghostSystem.addPoints(3);
  advanceSeconds(game, 10.1);

  let snapshot = game.getSnapshot();
  assert.equal(snapshot.mode, GAME_MODES.PREP);
  assert.ok(snapshot.prepLeft > 0);
  assert.equal(snapshot.points, 3);
  assert.equal(snapshot.pointCap, 9);
  assert.equal(snapshot.previewCoins.length, 5);
  assert.equal(snapshot.previewPaths.length, 1);

  game.update(0.05, { ...createIdleInput(), skill: 'magnet' });
  snapshot = game.getSnapshot();
  assert.equal(snapshot.points, 0);
  assert.equal(snapshot.skills.find((skill) => skill.id === 'magnet').active, true);

  advanceUntilPlaying(game);
  snapshot = game.getSnapshot();
  assert.equal(snapshot.mode, GAME_MODES.PLAYING);
  assert.equal(snapshot.level, 2);
  assert.equal(snapshot.skills.find((skill) => skill.id === 'magnet').active, true);
});

test('shield blocks one ghost hit, counter-killing that ghost', () => {
  const game = new Game({ storage: createStorage(), random: () => 0.5 });
  game.advance();
  game.state.coinsGot = 3;
  advanceSeconds(game, 10.1);

  game.ghostSystem.addPoints(5);
  game.update(0.05, { ...createIdleInput(), skill: 'shield' });
  game.advance();

  let snapshot = game.getSnapshot();
  assert.equal(snapshot.level, 2);
  assert.equal(snapshot.ghosts.length, 1);
  assert.equal(snapshot.skills.find((skill) => skill.id === 'shield').active, true);

  advanceSeconds(game, 1.35);
  snapshot = game.getSnapshot();
  assert.equal(snapshot.mode, GAME_MODES.PLAYING);
  assert.equal(snapshot.skills.find((skill) => skill.id === 'shield').active, false);
  assert.equal(snapshot.ghosts.length, 0);
  assert.ok(snapshot.shieldGrace > 0);
});
