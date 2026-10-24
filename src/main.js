import './ui/style.css';
import { Game } from './core/game.js';
import { createInterface } from './ui/interface.js';
import { createRenderer } from './ui/renderer.js';

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

  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__ghostsOfMe', {
      configurable: true,
      value: Object.freeze({ getSnapshot: () => game.getSnapshot() })
    });
  }

  let previousFrame = performance.now();
  function frame(now) {
    const deltaSeconds = Math.min((now - previousFrame) / 1000, 0.05);
    previousFrame = now;
    game.update(deltaSeconds, ui.getInput());
    renderer.notify(game.consumeEvents());
    const snapshot = game.getSnapshot();
    ui.update(snapshot);
    renderer.render(snapshot, deltaSeconds, now);
    requestAnimationFrame(frame);
  }

  const initialSnapshot = game.getSnapshot();
  ui.update(initialSnapshot);
  renderer.render(initialSnapshot, 0, performance.now());
  requestAnimationFrame(frame);
}
