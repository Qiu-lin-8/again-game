import { GAME_CONFIG, clamp } from '../core/config.js';
import { GAME_MODES, createIdleInput } from '../shared/contracts.js';

const MOVEMENT_KEYS = new Set([
  'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'
]);

export function createInterface({ canvas, onAction, getMode }) {
  const element = (id) => document.getElementById(id);
  const overlay = element('overlay');
  const actionButton = element('actionButton');
  const metrics = {
    level: element('levelMetric'),
    time: element('timeMetric'),
    score: element('scoreMetric'),
    best: element('bestMetric')
  };
  const keys = Object.create(null);
  const pointer = { active: false, touch: false, x: GAME_CONFIG.start.x, y: GAME_CONFIG.start.y };
  let renderedDialogKey = '';
  let pendingSkill = null;
  let skills = [];

  function setModal({ icon, tag, title, description, button, note, rules = [] }) {
    element('dialogIcon').textContent = icon;
    element('dialogTag').textContent = tag;
    element('dialogTitle').textContent = title;
    element('dialogText').innerHTML = description;
    element('quickRules').innerHTML = rules.map((rule) => `<span>${rule}</span>`).join('');
    element('dialogNote').textContent = note || '';
    actionButton.textContent = button;
  }

  function showDialog(snapshot) {
    const key = `${snapshot.mode}:${JSON.stringify(snapshot.outcome)}`;
    if (key === renderedDialogKey) return;
    renderedDialogKey = key;

    if (snapshot.mode === GAME_MODES.PLAYING || snapshot.mode === GAME_MODES.PREP) {
      overlay.classList.add('hidden');
      overlay.classList.remove('mode-menu', 'mode-clear', 'mode-over');
      return;
    }

    overlay.classList.remove('hidden');

    if (snapshot.mode === GAME_MODES.MENU) {
      overlay.classList.add('mode-menu');
      overlay.classList.remove('mode-clear', 'mode-over');
      setModal({
        icon: '👻',
        tag: 'A GAME ABOUT YOUR PAST',
        title: '十秒后，你将成为敌人。',
        description: '每关只有 <strong>10 秒</strong>。收集至少 <strong>3 颗星星</strong>，就能进入下一关。<br />多吃的第 <strong>4、5 颗星星</strong>会换成<strong>积分</strong>（最多 9 分），在关卡间的<strong>准备阶段</strong>购买技能。<br />🧲 磁铁 3 分 · 🕊 原谅 4 分 · 🛡 免死 5 分。',
        button: '开始游戏 →',
        note: '鼠标移动 / WASD / 方向键 · 准备阶段按 1·2·3 购买 · 手机上拖动手指',
        rules: ['✦ 收集 3 / 5 颗星星', '✨ 4·5 星 → 积分（上限 9）', '👻 躲避历史幽灵']
      });
      return;
    }

    const outcome = snapshot.outcome;
    if (snapshot.mode === GAME_MODES.CLEAR) {
      overlay.classList.add('mode-clear');
      overlay.classList.remove('mode-menu', 'mode-over');
      setModal({
        icon: '✨',
        tag: 'LEVEL CLEAR · TIME LOOP ACTIVATED',
        title: `第 ${outcome.finishedLevel} 关成功！`,
        description: `你拿到了 <strong>${outcome.coinsGot} / 5</strong> 颗星星！下一关，<strong>第 ${outcome.finishedLevel} 关的你</strong>将加入追杀。<br>你刚才走过的每一步，都可能成为新的危险。`,
        button: `进入第 ${outcome.nextLevel} 关 →`,
        note: '提示：可以刻意规划路线，给未来的自己留活路。',
        rules: [`🪙 本关 ${outcome.coinsGot} 颗`, `👻 下关 ${outcome.ghostCount} 个幽灵`, `✦ 累计 ${outcome.score} 分`]
      });
      return;
    }

    const hitGhost = outcome.reason === 'ghost';
    const title = hitGhost ? `被第 ${outcome.sourceLevel} 关的自己干掉了！` : '时间到了，星星没拿够！';
    const roast = hitGhost ? '系统评价：建议少和过去的自己来往。' : '系统评价：你的人生，还差几颗星星。';
    overlay.classList.add('mode-over');
    overlay.classList.remove('mode-menu', 'mode-clear');
    setModal({
      icon: hitGhost ? '💀' : '⏰',
      tag: 'GAME OVER · YOUR PAST WON',
      title: hitGhost ? '小丑竟是我自己！' : '再快一点点！',
      description: `<strong>${title}</strong><br>${roast}<br>这次闯到了 <strong>第 ${outcome.level} 关</strong>，共获得 <strong>${outcome.score} 分</strong>。`,
      button: '我不服！再来一局 ↻',
      note: '每次重新开局，都会生成一条全新的时间线。',
      rules: [`🏁 到达第 ${outcome.level} 关`, `⭐ 得分 ${outcome.score}`, `🏆 历史最佳 ${outcome.best} 关`]
    });
  }

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = clamp(
      (event.clientX - rect.left) * GAME_CONFIG.canvas.width / rect.width,
      GAME_CONFIG.arena.x + 20,
      GAME_CONFIG.arena.x + GAME_CONFIG.arena.w - 20
    );
    pointer.y = clamp(
      (event.clientY - rect.top) * GAME_CONFIG.canvas.height / rect.height,
      GAME_CONFIG.arena.y + 20,
      GAME_CONFIG.arena.y + GAME_CONFIG.arena.h - 20
    );
    pointer.active = true;
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (getMode() !== GAME_MODES.PLAYING) return;
    pointer.touch = event.pointerType === 'touch';
    updatePointer(event);
    if (pointer.touch) canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (getMode() !== GAME_MODES.PLAYING) return;
    if (event.pointerType === 'mouse' || (pointer.touch && (event.buttons > 0 || event.pressure > 0))) {
      updatePointer(event);
    }
  });
  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') pointer.active = false;
  });
  const endTouch = (event) => {
    if (event.pointerType === 'touch') {
      pointer.active = false;
      pointer.touch = false;
    }
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    if (key === 'enter' && getMode() !== GAME_MODES.PLAYING) {
      actionButton.click();
      return;
    }
    if (key === ' ' && getMode() === GAME_MODES.PREP) {
      actionButton.click();
      return;
    }
    if (getMode() === GAME_MODES.PREP) {
      const index = Number(key) - 1;
      if (index >= 0 && index < skills.length) {
        pendingSkill = skills[index].id;
        return;
      }
    }
    if (MOVEMENT_KEYS.has(key)) {
      keys[key] = true;
      pointer.active = false;
    }
  });
  window.addEventListener('keyup', (event) => { delete keys[event.key.toLowerCase()]; });
  window.addEventListener('blur', () => {
    for (const key in keys) delete keys[key];
    pointer.active = false;
  });
  actionButton.addEventListener('click', onAction);

  return {
    getInput() {
      const input = createIdleInput();
      input.left = Boolean(keys.a || keys.arrowleft);
      input.right = Boolean(keys.d || keys.arrowright);
      input.up = Boolean(keys.w || keys.arrowup);
      input.down = Boolean(keys.s || keys.arrowdown);
      input.pointer = { active: pointer.active, x: pointer.x, y: pointer.y };
      input.skill = pendingSkill;
      pendingSkill = null;
      return input;
    },
    update(snapshot) {
      skills = snapshot.skills || [];
      metrics.level.textContent = String(snapshot.level).padStart(2, '0');
      const urgent = snapshot.timeLeft < 3 && snapshot.mode === GAME_MODES.PLAYING;
      metrics.time.innerHTML = `${snapshot.timeLeft.toFixed(1)}<span style="font-size:12px;margin-left:3px">s</span>`;
      metrics.time.style.color = urgent ? '' : '#f0f5ff';
      metrics.time.classList.toggle('urgent', urgent);
      metrics.score.textContent = String(snapshot.score).padStart(4, '0');
      metrics.best.textContent = String(snapshot.best).padStart(2, '0');
      showDialog(snapshot);
    }
  };
}
