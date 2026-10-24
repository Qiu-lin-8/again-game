import { GAME_CONFIG, clamp } from '../core/config.js';
import { GAME_MODES, createIdleInput } from '../shared/contracts.js';

const MOVEMENT_KEYS = new Set([
  'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'
]);

// contracts 目前没有 CLEAR 常量（通关走 PREP），这里做字面量兜底，避免未来新增 clear 阶段时静默走错分支。
const CLEAR_MODE = GAME_MODES.CLEAR || 'clear';

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

  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  /* ------------------------------------------------------------------ *
   * 全屏封面 + 倒数进入
   * 进入网页先看到封面大图，正中间是赛博朋克风格「开始游戏」按钮；
   * 点击后倒数 3 → 2 → 1，再正式进入游戏（MENU → PLAYING）。
   * 封面 DOM 由 JS 注入，不改动 index.html 结构（避开与成员 B 的冲突）。
   * ------------------------------------------------------------------ */
  const COVER_COUNT_FROM = 3;
  let coverActive = true;
  let coverStarting = false;
  let coverTimer = null;

  function mountCover() {
    if (typeof document === 'undefined' || !document.body) return;
    if (document.getElementById('coverScreen')) return;
    const cover = document.createElement('div');
    cover.id = 'coverScreen';
    cover.className = 'cover-screen';
    cover.setAttribute('role', 'dialog');
    cover.setAttribute('aria-modal', 'true');
    cover.setAttribute('aria-label', '开始游戏');
    cover.innerHTML = [
      '<div class="cover-screen__aura" aria-hidden="true"></div>',
      '<div class="cover-screen__scan" aria-hidden="true"></div>',
      '<div class="cover-screen__content">',
      '  <button class="cyber-start" id="coverStart" type="button" aria-label="开始游戏">',
      '    <span class="cyber-start__border" aria-hidden="true"></span>',
      '    <span class="cyber-start__label">开始游戏</span>',
      '    <span class="cyber-start__hint">CLICK / ENTER</span>',
      '  </button>',
      '  <p class="cover-screen__hint">10 秒一局 · 收集 3 颗星星 · 躲避上一局的自己</p>',
      '</div>',
      '<div class="cover-countdown" id="coverCountdown" aria-live="assertive" aria-hidden="true"></div>'
    ].join('');
    document.body.appendChild(cover);
    document.body.classList.add('cover-active');

    const startButton = cover.querySelector('#coverStart');
    if (startButton) {
      startButton.addEventListener('click', beginCoverCountdown);
      try { startButton.focus({ preventScroll: true }); } catch { /* 焦点失败不致命 */ }
    }
  }

  function beginCoverCountdown() {
    if (!coverActive || coverStarting) return;
    coverStarting = true;
    const startButton = document.getElementById('coverStart');
    const countdown = document.getElementById('coverCountdown');
    if (startButton) { startButton.disabled = true; startButton.classList.add('is-running'); }
    let n = COVER_COUNT_FROM;
    const showNumber = () => {
      if (!countdown) return;
      countdown.setAttribute('aria-hidden', 'false');
      countdown.textContent = String(n);
      countdown.classList.remove('pop');
      void countdown.offsetWidth; // 强制重排以重启动画
      countdown.classList.add('pop');
    };
    const tick = () => {
      showNumber();
      if (n > 1) {
        n -= 1;
        coverTimer = window.setTimeout(tick, 1000);
      } else {
        coverTimer = window.setTimeout(finishCover, 1000);
      }
    };
    tick();
  }

  function finishCover() {
    if (coverTimer) { window.clearTimeout(coverTimer); coverTimer = null; }
    coverActive = false;
    const cover = document.getElementById('coverScreen');
    const countdown = document.getElementById('coverCountdown');
    if (countdown) countdown.textContent = '';
    if (cover) {
      cover.classList.add('is-hidden');
      window.setTimeout(() => { cover.style.display = 'none'; }, 540);
    }
    document.body.classList.remove('cover-active');
    onAction(); // 正式开局：MENU → PLAYING
  }

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
      overlay.setAttribute('aria-hidden', 'true');
      return;
    }

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    if (snapshot.mode === GAME_MODES.MENU) {
      overlay.classList.add('mode-menu');
      overlay.classList.remove('mode-clear', 'mode-over');
      setModal({
        icon: '👻',
        tag: 'A GAME ABOUT YOUR PAST',
        title: '十秒后，你将成为敌人。',
        description: '每关只有 <strong>10 秒</strong>，收集 <strong>3 颗星星</strong>即可进入下一关。<br />多吃的星星会换成<strong>积分</strong>，在关卡间购买技能。<br />你走过的路线，下一关会变成<strong>追杀你的自己</strong>。',
        button: '开始游戏 →',
        note: '鼠标移动 / WASD / 方向键 · 准备阶段按 1·2·3 购买 · 手机上按住拖动',
        rules: ['✦ 收集 3 / 5 颗星星', '✨ 4·5 星 → 积分', '👻 躲避历史幽灵']
      });
      return;
    }

    const outcome = snapshot.outcome || {};
    if (snapshot.mode === CLEAR_MODE) {
      overlay.classList.add('mode-clear');
      overlay.classList.remove('mode-menu', 'mode-over');
      setModal({
        icon: '✨',
        tag: 'LEVEL CLEAR · TIME LOOP ACTIVATED',
        title: `第 ${outcome.finishedLevel} 关成功！`,
        description: `你拿到了 <strong>${outcome.coinsGot} / 5</strong> 颗星星！下一关，<strong>第 ${outcome.finishedLevel} 关的你</strong>将加入追杀。`,
        button: `进入第 ${outcome.nextLevel} 关 →`,
        note: '提示：可以刻意规划路线，给未来的自己留活路。',
        rules: [`🪙 本关 ${outcome.coinsGot} 颗`, `👻 下关 ${outcome.ghostCount} 个幽灵`, `✦ 累计 ${outcome.score} 分`]
      });
      return;
    }

    const hitGhost = outcome.reason === 'ghost';
    const roast = hitGhost
      ? '系统评价：建议少和过去的自己来往。'
      : '系统评价：你的人生，还差几颗星星。';
    const cause = hitGhost
      ? `被 <strong>第 ${outcome.sourceLevel} 关</strong>的自己干掉了！`
      : '时间到了，星星没拿够！';
    overlay.classList.add('mode-over');
    overlay.classList.remove('mode-menu', 'mode-clear');
    setModal({
      icon: hitGhost ? '💀' : '⏰',
      tag: 'GAME OVER · YOUR PAST WON',
      title: hitGhost ? '小丑竟是我自己！' : '再快一点点！',
      description: `${cause}<br><span class="roast">${roast}</span><br>这次闯到了 <strong>第 ${outcome.level} 关</strong>，共获得 <strong>${outcome.score} 分</strong>。`,
      button: '我不服！再来一局！',
      note: `🏆 历史最高：第 ${outcome.best} 关 · 每次重开都会生成一条全新的时间线。`,
      rules: [`🏁 到达第 ${outcome.level} 关`, `⭐ 得分 ${outcome.score}`, `🏆 最佳 ${outcome.best} 关`]
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
    // 封面阶段：只允许回车/空格触发开始，屏蔽移动与快捷操作
    if (coverActive) {
      if (key === 'enter' || key === ' ') {
        event.preventDefault();
        beginCoverCountdown();
      }
      return;
    }
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

  mountCover();

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
      // 供 CSS 按阶段切换视觉（不修改 HTML 结构）
      document.body.dataset.mode = snapshot.mode;
      metrics.level.textContent = String(snapshot.level).padStart(2, '0');
      const urgent = snapshot.timeLeft < 3 && snapshot.mode === GAME_MODES.PLAYING;
      metrics.time.textContent = snapshot.timeLeft.toFixed(1);
      metrics.time.style.color = urgent ? '' : '#f0f5ff';
      metrics.time.classList.toggle('urgent', urgent);
      metrics.score.textContent = String(snapshot.score).padStart(4, '0');
      metrics.best.textContent = String(snapshot.best).padStart(2, '0');
      showDialog(snapshot);
    }
  };
}
