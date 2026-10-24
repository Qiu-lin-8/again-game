/**
 * 音频管理器 / Audio Manager
 * ------------------------------------------------------------------
 * 职责：
 *   1. 预加载并复用音频实例（不重复创建大量 Audio 节点）
 *   2. 处理游戏视觉事件 coin / clear / lose / shield 对应音效
 *   3. 根据游戏模式变化启停背景音乐、播放开始音效
 *   4. 静音切换 + localStorage 持久化
 *   5. 浏览器自动播放限制：首次用户交互解锁音频
 *   6. 页面失焦时暂停 / 恢复背景音乐
 *   7. 任何音频播放失败都不影响游戏主循环
 *
 * 该模块是纯逻辑 + 可注入依赖，方便在 Node 环境做单元测试。
 * main.js 负责用 Vite 的 `?url` import 取到真实音频地址后注入。
 */

const STORAGE_KEY = 'ghosts-of-me-muted';

/**
 * 游戏模式常量（与 shared/contracts.js 的 GAME_MODES 保持一致，避免循环依赖）。
 */
export const MODES = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  PREP: 'prep',
  OVER: 'over'
});

/**
 * 事件类型 → 音效名 映射。
 * coin / clear / lose / shield 来自 game.consumeEvents()。
 */
const EVENT_SOUND = Object.freeze({
  coin: 'coin',
  clear: 'clear',
  lose: 'lose',
  shield: 'shield'
});

/**
 * @typedef {Object} SoundDef
 * @property {string} src        音频文件 URL
 * @property {boolean} [loop]    是否循环
 * @property {number} [volume]   0..1 音量
 * @property {number} [pool]     复用实例数（应对连击，默认 1）
 */
/**
 * @typedef {Object} AudioManagerOptions
 * @property {Record<string, SoundDef>} [sounds]   音效定义表
 * @property {Storage} [storage]                    localStorage 兼容对象
 * @property {() => any} [audioFactory]             接收 url 返回类 Audio 对象（测试注入）
 * @property {() => boolean} [isDocumentHidden]     返回页面是否隐藏（测试注入）
 * @property {Document} [doc]                        document（绑定可见性事件）
 * @property {Window} [win]                          window（绑定交互事件）
 */

function noop() {}

function safeCall(fn, ...args) {
  try {
    return fn?.(...args);
  } catch {
    return undefined;
  }
}

function resolveMuted(storage) {
  try {
    return storage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 创建音频管理器。
 * @param {AudioManagerOptions} [options]
 */
export function createAudioManager(options = {}) {
  const sounds = options.sounds ?? {};
  const storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  const audioFactory = options.audioFactory ?? ((url) => new Audio(url));
  const isDocumentHidden = options.isDocumentHidden ?? (() => typeof document !== 'undefined' && document.hidden);
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : null);
  const win = options.win ?? (typeof window !== 'undefined' ? window : null);

  // 已创建的音频实例池：soundName -> HTMLAudioElement[]
  const pools = Object.create(null);
  // 各音效当前轮询下标
  const cursor = Object.create(null);
  let muted = resolveMuted(storage);
  let unlocked = false;
  let bgmPlaying = false;
  let lastMode = null;
  let lastCoinTime = -Infinity;
  // coin 节流：避免同一帧内的多枚金币同时触发爆音
  const COIN_THROTTLE_MS = 60;

  function ensurePool(name) {
    if (pools[name]) return pools[name];
    const def = sounds[name];
    if (!def) return null;
    const size = Math.max(1, def.pool ?? 1);
    const list = [];
    for (let i = 0; i < size; i += 1) {
      const el = audioFactory(def.src);
      if (el) {
        el.preload = 'auto';
        el.loop = Boolean(def.loop);
        applyVolumeTo(el, def.volume);
        list.push(el);
      }
    }
    pools[name] = list;
    cursor[name] = 0;
    return list;
  }

  function applyVolumeTo(el, baseVol) {
    if (!el) return;
    const base = Number.isFinite(baseVol) ? baseVol : 1;
    // 静音时统一为 0，BGM 失焦时再额外压低（见 setBgmDucked）
    el.volume = muted ? 0 : clamp01(base);
  }

  function refreshAllVolumes() {
    for (const name of Object.keys(sounds)) {
      const def = sounds[name];
      const pool = pools[name];
      if (!pool) continue;
      for (const el of pool) applyVolumeTo(el, def.volume);
    }
  }

  function applyMuteToPool(name) {
    const def = sounds[name];
    const pool = pools[name];
    if (!pool) return;
    for (const el of pool) applyVolumeTo(el, def.volume);
  }

  function playOne(name) {
    const pool = ensurePool(name);
    if (!pool || pool.length === 0) return;
    const def = sounds[name];
    const idx = cursor[name] % pool.length;
    cursor[name] = (idx + 1) % pool.length;
    const el = pool[idx];
    if (!el) return;
    // 单次音效重置到开头，支持连击重放
    if (!def.loop) {
      try { el.currentTime = 0; } catch { /* 某些浏览器在未加载时抛错 */ }
    }
    const result = el.play?.();
    if (result && typeof result.then === 'function') {
      result.catch(noop);
    }
  }

  function startBgm() {
    const pool = ensurePool('bgm');
    if (!pool || pool.length === 0) return;
    const el = pool[0];
    if (!el || bgmPlaying) return;
    if (!defBgmLoop()) el.loop = true;
    const result = el.play?.();
    if (result && typeof result.then === 'function') {
      result.then(() => { bgmPlaying = true; }, noop);
    } else {
      bgmPlaying = true;
    }
  }

  function stopBgm() {
    const pool = pools.bgm;
    if (!pool) return;
    const el = pool[0];
    if (!el) return;
    safeCall(() => el.pause());
    try { el.currentTime = 0; } catch { /* ignore */ }
    bgmPlaying = false;
  }

  function defBgmLoop() {
    return Boolean(sounds.bgm?.loop);
  }

  /** 处理来自 game.consumeEvents() 的视觉事件。 */
  function handleEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return;
    for (const evt of events) {
      const type = evt?.type;
      const soundName = EVENT_SOUND[type];
      if (!soundName) continue;
      if (soundName === 'coin') {
        // 节流：避免同一帧内多枚金币产生爆音
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (now - lastCoinTime < COIN_THROTTLE_MS) continue;
        lastCoinTime = now;
      }
      playOne(soundName);
    }
  }

  /**
   * 通知当前游戏模式，用于启停背景音乐、播放开始音效。
   * @param {string} mode 当前模式
   */
  function onMode(mode) {
    if (mode === lastMode) return;
    const prev = lastMode;
    lastMode = mode;

    if (mode === MODES.PLAYING) {
      // 仅当从「菜单 / 失败 / 初始」进入 playing 时播放开始音效；
      // 准备阶段（PREP）进入下一关不重复播放，避免每关都响。
      if (prev === MODES.MENU || prev === MODES.OVER || prev === null) {
        playOne('start');
      }
      if (!muted) startBgm();
    } else if (mode === MODES.OVER) {
      stopBgm();
    } else if (mode === MODES.MENU) {
      stopBgm();
    }
    // PREP（准备阶段）保持 BGM 继续播放
  }

  /** 切换静音状态，返回切换后的状态。 */
  function toggleMute() {
    muted = !muted;
    try { storage?.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
    if (muted) {
      stopBgm();
    } else {
      // 取消静音后，若处于游戏中则恢复 BGM
      if (lastMode === MODES.PLAYING || lastMode === MODES.PREP) startBgm();
    }
    refreshAllVolumes();
    return muted;
  }

  /** 返回当前静音状态。 */
  function isMuted() {
    return muted;
  }

  /** 标记音频已解锁（用户首次交互后调用）。 */
  function unlock() {
    unlocked = true;
  }

  /** 返回音频是否已解锁。 */
  function isUnlocked() {
    return unlocked;
  }

  /** 页面可见性变化处理：失焦暂停 BGM，恢复时若在游戏中则继续。 */
  function handleVisibility() {
    if (isDocumentHidden()) {
      // 失焦：暂停 BGM（音效不停，因为是瞬时的）
      if (bgmPlaying) {
        const pool = pools.bgm;
        if (pool && pool[0]) safeCall(() => pool[0].pause());
      }
    } else if (!muted && (lastMode === MODES.PLAYING || lastMode === MODES.PREP)) {
      // 恢复焦点且仍处于游戏中：继续 BGM
      if (bgmPlaying) {
        const pool = pools.bgm;
        if (pool && pool[0]) {
          const result = pool[0].play?.();
          if (result && typeof result.then === 'function') result.catch(noop);
        }
      }
    }
  }

  // 绑定 DOM 事件（仅在浏览器环境）
  if (doc) {
    doc.addEventListener('visibilitychange', handleVisibility);
  }
  if (win) {
    const unlockOnce = () => {
      unlock();
    };
    win.addEventListener('pointerdown', unlockOnce, { once: true });
    win.addEventListener('keydown', unlockOnce, { once: true });
    try {
      win.addEventListener('touchstart', unlockOnce, { once: true, passive: true });
    } catch { /* ignore */ }
  }

  return {
    handleEvents,
    onMode,
    toggleMute,
    isMuted,
    unlock,
    isUnlocked,
    /** 仅供测试与调试：内部实例池数量 */
    _poolCount: () => Object.keys(pools).reduce((sum, name) => sum + (pools[name]?.length ?? 0), 0),
    /** 仅供测试：强制释放（无副作用，不可恢复） */
    _dispose: () => {
      for (const name of Object.keys(pools)) {
        for (const el of pools[name]) safeCall(() => el.pause());
      }
    }
  };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}