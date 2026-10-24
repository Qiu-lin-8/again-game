import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioManager, MODES } from '../src/media/audio.js';

/**
 * 创建 mock 音频元素，记录调用历史，不依赖真实 Audio API。
 */
function createMockAudioFactory() {
  const calls = [];
  const make = (url) => ({
    src: url,
    preload: 'auto',
    loop: false,
    volume: 1,
    _touchedAt: 0,
    _paused: true,
    get paused() { return this._paused; },
    get currentTime() { return this._touchedAt; },
    set currentTime(v) { calls.push({ op: 'seek', url, to: v }); this._touchedAt = v; },
    play() {
      calls.push({ op: 'play', url });
      this._paused = false;
      return Promise.resolve();
    },
    pause() { calls.push({ op: 'pause', url }); this._paused = true; }
  });
  return { factory: make, calls };
}

/**
 * 创建内存版 storage，模拟 localStorage。
 */
function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); }
  };
}

const baseSounds = {
  bgm: { src: 'bgm.ogg', loop: true, volume: 0.5 },
  start: { src: 'start.wav', loop: false, volume: 0.7 },
  coin: { src: 'coin.wav', loop: false, volume: 0.6, pool: 2 },
  clear: { src: 'clear.wav', loop: false, volume: 0.7 },
  lose: { src: 'lose.wav', loop: false, volume: 0.7 },
  shield: { src: 'shield.ogg', loop: false, volume: 0.7 }
};

function makeManager(overrides = {}) {
  const { factory, calls } = createMockAudioFactory();
  const storage = overrides.storage ?? createMemoryStorage();
  const manager = createAudioManager({
    sounds: baseSounds,
    storage,
    audioFactory: factory,
    isDocumentHidden: () => false,
    doc: null,
    win: null,
    ...overrides
  });
  return { manager, storage, calls };
}

test('AudioManager 读取静音状态', () => {
  const storage = createMemoryStorage();
  storage.setItem('ghosts-of-me-muted', '1');
  const { manager } = makeManager({ storage });
  assert.equal(manager.isMuted(), true);
});

test('toggleMute 切换并持久化静音状态', () => {
  const { manager, storage } = makeManager();
  assert.equal(manager.isMuted(), false);
  const after = manager.toggleMute();
  assert.equal(after, true);
  assert.equal(manager.isMuted(), true);
  assert.equal(storage.getItem('ghosts-of-me-muted'), '1');
  const after2 = manager.toggleMute();
  assert.equal(after2, false);
  assert.equal(storage.getItem('ghosts-of-me-muted'), '0');
});

test('handleEvents 触发对应音效 play', () => {
  const { manager, calls } = makeManager();
  manager.handleEvents([
    { type: 'coin', x: 1, y: 1 },
    { type: 'clear', x: 1, y: 1 },
    { type: 'lose', x: 1, y: 1 },
    { type: 'shield', x: 1, y: 1 }
  ]);
  const plays = calls.filter((c) => c.op === 'play').map((c) => c.url);
  assert.ok(plays.includes('coin.wav'));
  assert.ok(plays.includes('clear.wav'));
  assert.ok(plays.includes('lose.wav'));
  assert.ok(plays.includes('shield.ogg'));
});

test('未知事件类型不会触发音效且不抛错', () => {
  const { manager, calls } = makeManager();
  assert.doesNotThrow(() => manager.handleEvents([
    { type: 'unknown' },
    { type: 'foo' },
    null,
    undefined,
    { /* 缺少 type */ }
  ]));
  assert.equal(calls.filter((c) => c.op === 'play').length, 0);
});

test('handleEvents 空数组合法输入不抛错', () => {
  const { manager } = makeManager();
  assert.doesNotThrow(() => manager.handleEvents([]));
  assert.doesNotThrow(() => manager.handleEvents(null));
  assert.doesNotThrow(() => manager.handleEvents(undefined));
});

test('连续 coin 事件被节流，避免爆音', () => {
  const { manager, calls } = makeManager();
  // 同一帧内连续 5 枚金币，节流后只播放 1 次
  manager.handleEvents([
    { type: 'coin' },
    { type: 'coin' },
    { type: 'coin' },
    { type: 'coin' },
    { type: 'coin' }
  ]);
  const coinPlays = calls.filter((c) => c.op === 'play' && c.url === 'coin.wav').length;
  assert.equal(coinPlays, 1);
});

test('模式变化 playing 时播放开始音效', () => {
  const { manager, calls } = makeManager();
  manager.onMode(MODES.PLAYING);
  const startPlays = calls.filter((c) => c.op === 'play' && c.url === 'start.wav').length;
  assert.equal(startPlays, 1);
});

test('模式变化 over 时停止 BGM（不抛错）', () => {
  const { manager, calls } = makeManager();
  manager.onMode(MODES.PLAYING);
  manager.onMode(MODES.OVER);
  const pauses = calls.filter((c) => c.op === 'pause' && c.url === 'bgm.ogg').length;
  assert.ok(pauses >= 1);
});

test('menu 模式停止 BGM', () => {
  const { manager, calls } = makeManager();
  manager.onMode(MODES.PLAYING);
  manager.onMode(MODES.MENU);
  assert.ok(calls.some((c) => c.op === 'pause' && c.url === 'bgm.ogg'));
});

test('静音状态下不播放 BGM', () => {
  const storage = createMemoryStorage();
  storage.setItem('ghosts-of-me-muted', '1');
  const { manager, calls } = makeManager({ storage });
  manager.onMode(MODES.PLAYING);
  // 静音时 start 音效仍会尝试 play（但元素 volume=0），BGM 不会 play
  const bgmPlays = calls.filter((c) => c.op === 'play' && c.url === 'bgm.ogg').length;
  assert.equal(bgmPlays, 0);
});

test('unlock 正常工作', () => {
  const { manager } = makeManager();
  assert.equal(manager.isUnlocked(), false);
  manager.unlock();
  assert.equal(manager.isUnlocked(), true);
});

test('重复 onMode 同一模式不重复触发', () => {
  const { manager, calls } = makeManager();
  manager.onMode(MODES.PLAYING);
  manager.onMode(MODES.PLAYING);
  const startPlays = calls.filter((c) => c.op === 'play' && c.url === 'start.wav').length;
  assert.equal(startPlays, 1);
});

test('toggleMute 解除静音后处于游戏中可恢复 BGM', () => {
  const { manager, calls } = makeManager();
  manager.onMode(MODES.PLAYING); // 开始 BGM
  // 先静音（停 BGM）
  manager.toggleMute();
  assert.equal(manager.isMuted(), true);
  // 再解除静音，处于 playing，应恢复 BGM
  manager.toggleMute();
  assert.equal(manager.isMuted(), false);
  const bgmPlays = calls.filter((c) => c.op === 'play' && c.url === 'bgm.ogg').length;
  assert.ok(bgmPlays >= 1);
});

test('未定义的声音不会导致重复创建实例池', () => {
  const { manager } = makeManager();
  manager.handleEvents([{ type: 'coin' }, { type: 'coin' }]);
  // coin pool 为 2
  const count = manager._poolCount();
  assert.ok(count === 2 || count === 0, `pool count 应为 0 或 2，实际: ${count}`);
});