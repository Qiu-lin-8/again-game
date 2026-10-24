import './ui/style.css';
import './media/media.css';
import { Game } from './core/game.js';
import { createInterface } from './ui/interface.js';
import { createRenderer } from './ui/renderer.js';
import { createAudioManager } from './media/audio.js';
import bgmUrl from '../assets/audio/bgm.ogg?url';
import startUrl from '../assets/audio/start.wav?url';
import coinUrl from '../assets/audio/coin.wav?url';
import clearUrl from '../assets/audio/clear.wav?url';
import loseUrl from '../assets/audio/lose.wav?url';
import shieldUrl from '../assets/audio/shield.ogg?url';

const canvas = document.getElementById('game');
const context = canvas.getContext('2d');

if (!context) {
  alert('当前浏览器不支持 Canvas，请更换 Chrome / Edge / Safari。');
} else {
  const game = new Game();
  const renderer = createRenderer(canvas, context);
  const ui = createInterface({
    canvas,
    getMode: () => game.getSnapshot().mode,
    onAction: () => game.advance()
  });

  // 音频管理器：处理视觉事件音效 + 模式变化的 BGM / 开始音效
  const audioManager = createAudioManager({
    sounds: {
      bgm: { src: bgmUrl, loop: true, volume: 0.5 },
      start: { src: startUrl, loop: false, volume: 0.7 },
      coin: { src: coinUrl, loop: false, volume: 0.6, pool: 2 },
      clear: { src: clearUrl, loop: false, volume: 0.7 },
      lose: { src: loseUrl, loop: false, volume: 0.7 },
      shield: { src: shieldUrl, loop: false, volume: 0.7 }
    }
  });

  // 静音按钮：同步图标与状态
  const soundToggle = document.getElementById('soundToggle');
  if (soundToggle) {
    const syncButton = () => {
      const muted = audioManager.isMuted();
      soundToggle.textContent = muted ? '🔇' : '🔊';
      soundToggle.setAttribute('aria-pressed', String(muted));
      soundToggle.classList.toggle('is-muted', muted);
    };
    syncButton();
    soundToggle.addEventListener('click', () => {
      audioManager.toggleMute();
      // 取消静音时显式解锁一次，确保移动端首次点击即有声音
      if (!audioManager.isMuted()) audioManager.unlock();
      syncButton();
    });
  }

  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__ghostsOfMe', {
      configurable: true,
      value: Object.freeze({ getSnapshot: () => game.getSnapshot() })
    });
  }

  let previousFrame = performance.now();
  let lastMode = null;
  function frame(now) {
    const deltaSeconds = Math.min((now - previousFrame) / 1000, 0.05);
    previousFrame = now;
    game.update(deltaSeconds, ui.getInput());
    // 事件先取出，再分别交给渲染器（粒子）和音频管理器（音效）
    const events = game.consumeEvents();
    renderer.notify(events);
    const snapshot = game.getSnapshot();
    if (snapshot.mode !== lastMode) {
      lastMode = snapshot.mode;
      audioManager.onMode(snapshot.mode);
    }
    ui.update(snapshot);
    audioManager.handleEvents(events);
    renderer.render(snapshot, deltaSeconds, now);
    requestAnimationFrame(frame);
  }

  const initialSnapshot = game.getSnapshot();
  lastMode = initialSnapshot.mode;
  audioManager.onMode(initialSnapshot.mode);
  ui.update(initialSnapshot);
  renderer.render(initialSnapshot, 0, performance.now());
  requestAnimationFrame(frame);
}
