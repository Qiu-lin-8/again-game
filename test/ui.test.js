import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, circledNumber } from '../src/ui/renderer.js';
import { GAME_MODES } from '../src/shared/contracts.js';

function createMockContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set() {
      return true;
    }
  });
}

function baseSnapshot(overrides = {}) {
  return {
    mode: GAME_MODES.PLAYING,
    level: 3,
    elapsed: 1.2,
    timeLeft: 8.6,
    score: 12,
    best: 4,
    coinsGot: 2,
    goal: 3,
    player: { x: 480, y: 270, radius: 17 },
    coins: [
      { x: 365, y: 260, taken: false },
      { x: 478, y: 145, taken: true },
      { x: 605, y: 270, taken: false }
    ],
    ghosts: [
      { id: 'ghost-1', sourceLevel: 1, x: 200, y: 200, trail: [{ x: 190, y: 190 }] },
      { id: 'ghost-2', sourceLevel: 2, x: 700, y: 300 }
    ],
    arena: { x: 39, y: 32, w: 882, h: 476 },
    graceLeft: 0,
    outcome: null,
    ...overrides
  };
}

test('circledNumber maps 1-20 to circled digits and falls back otherwise', () => {
  assert.equal(circledNumber(1), '①');
  assert.equal(circledNumber(3), '③');
  assert.equal(circledNumber(20), '⑳');
  assert.equal(circledNumber(21), '21');
  assert.equal(circledNumber(0), '0');
});

test('createRenderer exposes notify and render', () => {
  const renderer = createRenderer({}, createMockContext());
  assert.equal(typeof renderer.notify, 'function');
  assert.equal(typeof renderer.render, 'function');
});

test('render does not throw across game phases', () => {
  const renderer = createRenderer({}, createMockContext());
  const phases = [
    baseSnapshot({ mode: GAME_MODES.MENU }),
    baseSnapshot({ mode: GAME_MODES.PLAYING }),
    baseSnapshot({ mode: GAME_MODES.PLAYING, timeLeft: 1.5 }),
    baseSnapshot({ mode: GAME_MODES.CLEAR, outcome: { finishedLevel: 3, nextLevel: 4, coinsGot: 4, ghostCount: 2, score: 12 } }),
    baseSnapshot({ mode: GAME_MODES.OVER, outcome: { reason: 'ghost', sourceLevel: 2, level: 3, score: 12, best: 4 } })
  ];
  for (const snapshot of phases) {
    assert.doesNotThrow(() => renderer.render(snapshot, 0.016, 1000));
  }
});

test('notify handles coin/lose/clear events without throwing', () => {
  const renderer = createRenderer({}, createMockContext());
  assert.doesNotThrow(() => renderer.notify([
    { type: 'coin', x: 100, y: 100 },
    { type: 'lose', x: 100, y: 100 },
    { type: 'clear', x: 100, y: 100 }
  ]));
});
