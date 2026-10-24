import { GAME_CONFIG, GHOST_COLORS, clamp, distance } from '../core/config.js';
import { GAME_MODES } from '../shared/contracts.js';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

/**
 * 把关卡号渲染成带圈数字 ①…⑳，超出范围回退为普通数字。
 * 纯函数，便于单元测试，也用于幽灵来源关卡标识。
 */
export function circledNumber(level) {
  if (Number.isInteger(level) && level >= 1 && level <= CIRCLED.length) return CIRCLED[level - 1];
  return String(level);
}

export function createRenderer(canvas, context) {
  const particles = [];
  let prevPlayer = null;
  let prevMode = null;
  let flash = 0;
  let flashColor = '255,255,255';

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnParticles(x, y, color, count = 8) {
    for (let index = 0; index < count; index += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(40, 148);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(0.28, 0.7),
        maxLife: 0.7,
        color
      });
    }
  }

  function roundedRect(x, y, width, height, radius, fill, stroke = null) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    if (stroke) {
      context.strokeStyle = stroke;
      context.stroke();
    }
  }

  function star(x, y, outer, inner, color, rotation = 0) {
    context.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const angle = rotation + index * Math.PI / 5 - Math.PI / 2;
      const radius = index % 2 === 0 ? outer : inner;
      const sx = x + Math.cos(angle) * radius;
      const sy = y + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(sx, sy);
      else context.lineTo(sx, sy);
    }
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  function drawBackgroundOrbs(time) {
    const { width, height } = GAME_CONFIG.canvas;
    const orbs = [
      { bx: 0.22, by: 0.28, r: 130, c: '57,142,176', sp: 0.00018, ph: 0 },
      { bx: 0.78, by: 0.7, r: 160, c: '124,90,190', sp: 0.00014, ph: 1.7 },
      { bx: 0.55, by: 0.18, r: 110, c: '87,241,221', sp: 0.00022, ph: 3.1 }
    ];
    context.save();
    for (const orb of orbs) {
      const ox = width * orb.bx + Math.sin(time * orb.sp + orb.ph) * 26;
      const oy = height * orb.by + Math.cos(time * orb.sp * 1.3 + orb.ph) * 20;
      const glow = context.createRadialGradient(ox, oy, 8, ox, oy, orb.r);
      glow.addColorStop(0, `rgba(${orb.c},.10)`);
      glow.addColorStop(1, `rgba(${orb.c},0)`);
      context.fillStyle = glow;
      context.fillRect(ox - orb.r, oy - orb.r, orb.r * 2, orb.r * 2);
    }
    context.restore();
  }

  function drawBackdrop(snapshot) {
    const { width, height } = GAME_CONFIG.canvas;
    const arena = snapshot.arena;
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#101d41');
    gradient.addColorStop(0.55, '#0a1530');
    gradient.addColorStop(1, '#161330');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.save();
    context.beginPath();
    context.rect(arena.x, arena.y, arena.w, arena.h);
    context.clip();
    context.strokeStyle = 'rgba(110,153,226,.105)';
    context.lineWidth = 1;
    for (let x = arena.x + 20; x < arena.x + arena.w; x += 40) {
      context.beginPath();
      context.moveTo(x, arena.y);
      context.lineTo(x, arena.y + arena.h);
      context.stroke();
    }
    for (let y = arena.y + 20; y < arena.y + arena.h; y += 40) {
      context.beginPath();
      context.moveTo(arena.x, y);
      context.lineTo(arena.x + arena.w, y);
      context.stroke();
    }
    const glow = context.createRadialGradient(490, 260, 30, 490, 260, 360);
    glow.addColorStop(0, 'rgba(57,142,176,.075)');
    glow.addColorStop(1, 'rgba(57,142,176,0)');
    context.fillStyle = glow;
    context.fillRect(arena.x, arena.y, arena.w, arena.h);
    context.restore();

    roundedRect(arena.x, arena.y, arena.w, arena.h, 15, null, 'rgba(105,215,224,.3)');
    context.strokeStyle = 'rgba(93,249,224,.32)';
    context.lineWidth = 3;
    const corner = 26;
    const corners = [
      [arena.x, arena.y, 1, 1],
      [arena.x + arena.w, arena.y, -1, 1],
      [arena.x, arena.y + arena.h, 1, -1],
      [arena.x + arena.w, arena.y + arena.h, -1, -1]
    ];
    for (const [x, y, sx, sy] of corners) {
      context.beginPath();
      context.moveTo(x + sx * corner, y);
      context.lineTo(x + sx * 8, y);
      context.quadraticCurveTo(x, y, x, y + sy * 8);
      context.lineTo(x, y + sy * corner);
      context.stroke();
    }

    context.font = '700 11px system-ui';
    context.fillStyle = 'rgba(150,170,220,.36)';
    context.fillText(`LOOP / ${String(snapshot.level).padStart(2, '0')}`, 62, 69);
    context.textAlign = 'right';
    context.fillText('YOUR PAST IS WATCHING', 897, 69);
    context.textAlign = 'left';
  }

  function drawCoin(coin, time, offset) {
    if (coin.taken) return;
    const pulse = 1 + Math.sin(time * 0.004 + offset * 1.7) * 0.08;
    const bob = Math.sin(time * 0.003 + offset * 2.1) * 2.4;
    context.save();
    context.translate(coin.x, coin.y + bob);
    context.scale(pulse, pulse);
    context.shadowBlur = 22;
    context.shadowColor = '#e8b755';
    context.beginPath();
    context.arc(0, 0, 19, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255,200,94,.14)';
    context.fill();
    star(0, 0, 13.8, 6.7, '#ffd26f', time * 0.00045);
    context.shadowBlur = 0;
    star(0, 0, 6.5, 3.1, '#fff2bf', time * 0.00045);
    context.strokeStyle = 'rgba(255,242,191,.7)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(0, 0, 16.5, time * 0.0011, time * 0.0011 + Math.PI * 0.8);
    context.stroke();
    context.restore();
  }

  function drawAvatar(x, y, { ghost = false, index = 0, label = '你', alpha = 1, expression = 'idle' } = {}) {
    if (ghost) {
      const tint = GHOST_COLORS[index % GHOST_COLORS.length];
      const R = 16;
      const bottom = y + R * 0.95;
      const feet = 4;
      const w = (2 * R) / feet;
      context.save();
      context.globalAlpha = alpha;
      context.shadowColor = tint;
      context.shadowBlur = 22;
      context.beginPath();
      context.arc(x, y, R, Math.PI, Math.PI * 2, false);
      context.lineTo(x + R, bottom);
      for (let i = 0; i < feet; i += 1) {
        const xa = x + R - w * i;
        const xb = x + R - w * (i + 1);
        const xm = (xa + xb) / 2;
        context.quadraticCurveTo(xm, bottom + 7, xb, bottom);
      }
      context.closePath();
      context.fillStyle = tint;
      context.fill();
      context.shadowBlur = 0;

      context.beginPath();
      context.arc(x - 4, y - 4, R * 0.55, Math.PI * 1.05, Math.PI * 1.75, false);
      context.strokeStyle = 'rgba(255,255,255,.38)';
      context.lineWidth = 2.4;
      context.stroke();

      const eyeY = y - 1;
      context.fillStyle = '#3a1e36';
      context.beginPath();
      context.arc(x - 5, eyeY, 3, 0, Math.PI * 2);
      context.arc(x + 5, eyeY, 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,.92)';
      context.beginPath();
      context.arc(x - 4, eyeY - 1, 1, 0, Math.PI * 2);
      context.arc(x + 6, eyeY - 1, 1, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = '#3a1e36';
      context.lineWidth = 1.4;
      context.beginPath();
      context.arc(x, y + 5, 3, 0.12 * Math.PI, 0.88 * Math.PI);
      context.stroke();

      context.fillStyle = 'rgba(255,150,190,.32)';
      context.beginPath();
      context.arc(x - 8, y + 3, 2, 0, Math.PI * 2);
      context.arc(x + 8, y + 3, 2, 0, Math.PI * 2);
      context.fill();
      context.restore();
      context.textAlign = 'left';
      return;
    }

    const tint = '#68f5e5';
    context.save();
    context.globalAlpha = alpha;
    context.shadowColor = tint;
    context.shadowBlur = 30;
    context.beginPath();
    context.arc(x, y, 17, 0, Math.PI * 2);
    context.fillStyle = tint;
    context.fill();
    context.shadowBlur = 0;
    context.beginPath();
    context.arc(x, y - 4, 12, Math.PI, 0);
    context.fillStyle = 'rgba(255,255,255,.55)';
    context.fill();

    const eyeR = (expression === 'danger' || expression === 'fail') ? 3.2 : 2.4;
    const eyeDY = (expression === 'fail') ? -1 : -2;
    context.fillStyle = '#115363';
    context.beginPath();
    context.arc(x - 5, y + eyeDY, eyeR, 0, Math.PI * 2);
    context.arc(x + 5, y + eyeDY, eyeR, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = '#115363';
    context.lineWidth = 1.5;
    context.beginPath();
    if (expression === 'fail') {
      context.arc(x, y + 3, 4.2, 0, Math.PI * 2);
      context.fillStyle = '#115363';
      context.fill();
    } else if (expression === 'danger') {
      context.arc(x, y + 4, 2.6, 0, Math.PI * 2);
      context.fillStyle = '#115363';
      context.fill();
    } else {
      context.arc(x, y + 3, 3.5, 0, Math.PI);
      context.stroke();
    }

    if (expression === 'danger') {
      context.fillStyle = 'rgba(120,200,255,.85)';
      context.beginPath();
      context.arc(x + 12, y - 9, 2.4, 0, Math.PI * 2);
      context.fill();
    }

    if (label) {
      context.font = '800 11px system-ui';
      context.textAlign = 'center';
      const width = 24;
      roundedRect(x - width / 2, y - 36, width, 17, 8, 'rgba(17,76,88,.85)');
      context.fillStyle = '#c2fff7';
      context.fillText(label, x, y - 24);
    }
    context.restore();
    context.textAlign = 'left';
  }

  function drawGhostBadge(x, y, sourceLevel, tint) {
    const badge = circledNumber(sourceLevel);
    context.save();
    context.font = '800 13px system-ui';
    context.textAlign = 'center';
    const w = 24;
    roundedRect(x - w / 2, y - 50, w, 19, 9, 'rgba(10,16,34,.82)', tint);
    context.fillStyle = '#ffffff';
    context.fillText(badge, x, y - 37);
    context.restore();
  }

  function drawGhosts(snapshot, time) {
    snapshot.ghosts.forEach((ghost, index) => {
      const tint = GHOST_COLORS[index % GHOST_COLORS.length];
      context.save();
      (ghost.trail || []).forEach((position, trailIndex, trail) => {
        context.globalAlpha = (trailIndex + 1) * (0.22 / Math.max(1, trail.length));
        context.fillStyle = tint;
        context.beginPath();
        context.arc(position.x, position.y, 11, 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
      const intangible = snapshot.mode === GAME_MODES.PLAYING && snapshot.graceLeft > 0;
      const bob = Math.sin(time * 0.004 + index * 1.3) * 3;
      const gy = ghost.y + bob;
      drawGhostBadge(ghost.x, gy, ghost.sourceLevel, tint);
      drawAvatar(ghost.x, gy, {
        ghost: true,
        index,
        label: null,
        alpha: intangible ? 0.42 : 0.82
      });
    });
  }

  function drawHud(snapshot, time) {
    roundedRect(60, 87, 170, 34, 9, 'rgba(7,14,32,.72)', 'rgba(184,215,255,.12)');
    context.font = '700 14px system-ui';
    context.fillStyle = '#e3ebff';
    context.fillText(`✦  星星 ${snapshot.coinsGot} / ${snapshot.goal}`, 74, 109);
    context.font = '600 12px system-ui';
    context.fillStyle = '#a3afd0';
    context.textAlign = 'right';
    context.fillText(`幽灵 × ${snapshot.ghosts.length}`, 896, 108);
    context.textAlign = 'left';

    if (snapshot.mode === GAME_MODES.PLAYING && snapshot.ghosts.length && snapshot.graceLeft > 0) {
      roundedRect(377, 90, 206, 28, 10, 'rgba(87,241,221,.10)', 'rgba(87,241,221,.18)');
      context.textAlign = 'center';
      context.font = '700 12px system-ui';
      context.fillStyle = '#78f1e6';
      context.fillText(`出生保护 ${snapshot.graceLeft.toFixed(1)} 秒`, 480, 109);
      context.textAlign = 'left';
    }
    if (snapshot.mode === GAME_MODES.PLAYING && snapshot.coinsGot >= snapshot.goal) {
      roundedRect(356, 458, 248, 32, 9, 'rgba(36,106,98,.72)', 'rgba(107,244,207,.27)');
      context.textAlign = 'center';
      context.font = '700 13px system-ui';
      context.fillStyle = '#a0ffdf';
      context.fillText('✓  目标达成！坚持到倒计时结束', 480, 479);
      context.textAlign = 'left';
    }

    if (snapshot.mode === GAME_MODES.PLAYING && snapshot.timeLeft < 3) {
      const pulse = 1 + Math.sin(time * 0.012) * 0.14;
      const size = 30 * pulse;
      context.save();
      context.textAlign = 'center';
      context.font = `900 ${size}px system-ui`;
      context.fillStyle = '#ff5d8f';
      context.shadowColor = '#ff5d8f';
      context.shadowBlur = 18;
      context.fillText(snapshot.timeLeft.toFixed(1), 480, 64);
      context.restore();
    }
  }

  function drawParticles(deltaSeconds) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= deltaSeconds;
      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, 2.8, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawFlash() {
    if (flash <= 0) return;
    context.save();
    context.fillStyle = `rgba(${flashColor},${clamp(flash, 0, 1) * 0.5})`;
    context.fillRect(0, 0, GAME_CONFIG.canvas.width, GAME_CONFIG.canvas.height);
    context.restore();
  }

  function computeExpression(snapshot) {
    if (snapshot.mode === GAME_MODES.OVER) return 'fail';
    if (snapshot.mode === GAME_MODES.PLAYING) {
      let nearest = Infinity;
      for (const ghost of snapshot.ghosts) {
        nearest = Math.min(nearest, distance(snapshot.player, ghost));
      }
      const danger = snapshot.graceLeft <= 0 && nearest < 120;
      const moving = prevPlayer ? distance(snapshot.player, prevPlayer) > 0.8 : false;
      if (danger) return 'danger';
      if (moving) return 'move';
    }
    return 'idle';
  }

  return {
    notify(events) {
      for (const event of events) {
        if (event.type === 'coin') spawnParticles(event.x, event.y, '#ffcf72', 10);
        if (event.type === 'lose') { spawnParticles(event.x, event.y, '#ff6c9c', 26); flash = 0.9; flashColor = '255,93,143'; }
        if (event.type === 'clear') { spawnParticles(event.x, event.y, '#68f5e5', 18); flash = 0.9; flashColor = '120,249,224'; }
      }
    },
    render(snapshot, deltaSeconds, time) {
      if (prevMode !== GAME_MODES.CLEAR && snapshot.mode === GAME_MODES.CLEAR) { flash = 0.9; flashColor = '120,249,224'; }
      if (prevMode !== GAME_MODES.OVER && snapshot.mode === GAME_MODES.OVER) { flash = 0.9; flashColor = '255,93,143'; }

      drawBackdrop(snapshot);
      drawBackgroundOrbs(time);
      snapshot.coins.forEach((coin, index) => drawCoin(coin, time, index));
      drawGhosts(snapshot, time);
      drawAvatar(snapshot.player.x, snapshot.player.y, { expression: computeExpression(snapshot) });
      drawHud(snapshot, time);
      drawParticles(deltaSeconds);
      drawFlash();

      if (flash > 0) flash = Math.max(0, flash - deltaSeconds * 2.5);
      prevPlayer = { x: snapshot.player.x, y: snapshot.player.y };
      prevMode = snapshot.mode;
    }
  };
}
