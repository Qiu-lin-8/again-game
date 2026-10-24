import test from 'node:test';
import assert from 'node:assert/strict';
import { GhostSystem } from '../src/ghost/ghost.js';
import { interpolateTrack } from '../src/ghost/replay.js';

function runLevel(ghosts, level, yOffset) {
  ghosts.beginLevel({ level, startPosition: { x: 0, y: yOffset } });
  ghosts.recordPosition({ time: 5, position: { x: 100, y: yOffset } });
  ghosts.finishLevel({ time: 10, position: { x: 200, y: yOffset } });
}

test('first level has no ghosts', () => {
  const ghosts = new GhostSystem({ sampleInterval: 0.05 });
  assert.equal(ghosts.count, 0);
  assert.deepEqual(ghosts.getGhosts(5), []);
});

test('second level replays one ghost, third level replays two, each on its own track', () => {
  const ghosts = new GhostSystem({ sampleInterval: 0.05 });

  runLevel(ghosts, 1, 0);
  assert.equal(ghosts.count, 1);

  runLevel(ghosts, 2, 100);
  assert.equal(ghosts.count, 2);

  const snapshot = ghosts.getGhosts(5);
  assert.equal(snapshot.length, 2);
  assert.deepEqual(snapshot.map((ghost) => ghost.sourceLevel), [1, 2]);
  assert.deepEqual(snapshot.map((ghost) => ghost.id), ['ghost-1', 'ghost-2']);

  // 每个幽灵还原各自历史关卡的轨迹，而不是追踪当前玩家
  assert.equal(snapshot[0].x, 100);
  assert.equal(snapshot[0].y, 0);
  assert.equal(snapshot[1].x, 100);
  assert.equal(snapshot[1].y, 100);
});

test('replay uses time-based linear interpolation between samples', () => {
  const position = interpolateTrack(
    [{ t: 0, x: 100, y: 200 }, { t: 2, x: 300, y: 400 }],
    0.5
  );
  assert.deepEqual(position, { x: 150, y: 250 });
});

test('sampling lands on a fixed time grid regardless of frame cadence', () => {
  function sampledTimes(cadence) {
    const ghosts = new GhostSystem({ sampleInterval: 0.1 });
    ghosts.beginLevel({ level: 1, startPosition: { x: 0, y: 0 } });
    for (let t = 0; t <= 1 + cadence; t += cadence) {
      ghosts.recordPosition({ time: Math.min(t, 1), position: { x: t * 10, y: 0 } });
    }
    ghosts.finishLevel({ time: 1, position: { x: 10, y: 0 } });
    return ghosts.history[0].track.map((entry) => entry.t);
  }

  assert.deepEqual(sampledTimes(0.05), sampledTimes(0.002));
});

test('ghost movement is smooth with no teleporting', () => {
  const ghosts = new GhostSystem({ sampleInterval: 0.045 });
  ghosts.beginLevel({ level: 1, startPosition: { x: 480, y: 270 } });
  for (let t = 0; t <= 10; t += 0.05) {
    const time = Math.min(t, 10);
    ghosts.recordPosition({
      time,
      position: { x: 480 + 120 * Math.sin(time), y: 270 + 90 * Math.sin(time * 1.3) }
    });
  }
  ghosts.finishLevel({
    time: 10,
    position: { x: 480 + 120 * Math.sin(10), y: 270 + 90 * Math.sin(13) }
  });

  let previous = ghosts.getGhosts(0)[0];
  let maxJump = 0;
  for (let t = 0.01; t <= 10; t += 0.01) {
    const current = ghosts.getGhosts(t)[0];
    maxJump = Math.max(maxJump, Math.hypot(current.x - previous.x, current.y - previous.y));
    previous = current;
  }
  assert.ok(maxJump < 8, `ghost teleported ${maxJump.toFixed(2)}px between consecutive 10ms samples`);
});

test('restarting the run clears all recorded history', () => {
  const ghosts = new GhostSystem({ sampleInterval: 0.05 });
  runLevel(ghosts, 1, 0);
  assert.equal(ghosts.count, 1);
  assert.equal(ghosts.getGhosts(0).length, 1);

  ghosts.reset();
  assert.equal(ghosts.count, 0);
  assert.deepEqual(ghosts.getGhosts(0), []);
});

test('out-of-order recording is ignored instead of corrupting the track', () => {
  const ghosts = new GhostSystem({ sampleInterval: 0.1 });
  ghosts.beginLevel({ level: 1, startPosition: { x: 0, y: 0 } });
  ghosts.recordPosition({ time: 5, position: { x: 50, y: 0 } });
  ghosts.recordPosition({ time: 3, position: { x: 999, y: 999 } });
  ghosts.finishLevel({ time: 10, position: { x: 100, y: 0 } });

  const ghost = ghosts.getGhosts(5)[0];
  assert.equal(ghost.x, 50);
  assert.equal(ghost.y, 0);
});

test('empty tracks and invalid times do not throw', () => {
  assert.equal(interpolateTrack([], 1), null);
  assert.equal(interpolateTrack([{ t: 0, x: 0, y: 0 }], NaN), null);
  assert.deepEqual(interpolateTrack([{ t: 0, x: 5, y: 6 }], 3), { x: 5, y: 6 });

  const ghosts = new GhostSystem();
  runLevel(ghosts, 1, 0);
  assert.doesNotThrow(() => ghosts.getGhosts(NaN));
  assert.deepEqual(ghosts.getGhosts(NaN), []);
});
