import { GAME_CONFIG, GHOST_COLORS, clamp } from '../core/config.js';
import { GAME_MODES } from '../shared/contracts.js';

export function createRenderer(canvas, context) {
  const particles = [];

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
    context.save();
    context.translate(coin.x, coin.y);
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
    context.restore();
  }

  function drawAvatar(x, y, { ghost = false, index = 0, label = '你', alpha = 1 } = {}) {
    const tint = ghost ? GHOST_COLORS[index % GHOST_COLORS.length] : '#68f5e5';
    context.save();
    context.globalAlpha = alpha;
    context.shadowColor = tint;
    context.shadowBlur = ghost ? 20 : 30;
    context.beginPath();
    context.arc(x, y, ghost ? 16 : 17, 0, Math.PI * 2);
    context.fillStyle = tint;
    context.fill();
    context.shadowBlur = 0;
    context.beginPath();
    context.arc(x, y - 4, ghost ? 11 : 12, Math.PI, 0);
    context.fillStyle = ghost ? 'rgba(255,255,255,.27)' : 'rgba(255,255,255,.55)';
    context.fill();
    context.fillStyle = ghost ? '#46253f' : '#115363';
    context.beginPath();
    context.arc(x - 5, y - 2, 2.4, 0, Math.PI * 2);
    context.arc(x + 5, y - 2, 2.4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = ghost ? '#612e56' : '#115363';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y + 3, 3.5, 0, Math.PI);
    context.stroke();
    context.font = '800 11px system-ui';
    context.textAlign = 'center';
    const width = ghost ? 32 : 24;
    roundedRect(x - width / 2, y - 36, width, 17, 8, ghost ? 'rgba(86,35,67,.8)' : 'rgba(17,76,88,.85)');
    context.fillStyle = ghost ? '#ffc1d7' : '#c2fff7';
    context.fillText(label, x, y - 24);
    context.restore();
    context.textAlign = 'left';
  }

  function drawGhosts(snapshot) {
    snapshot.ghosts.forEach((ghost, index) => {
      const tint = GHOST_COLORS[index % GHOST_COLORS.length];
      context.save();
      (ghost.trail || []).forEach((position, trailIndex, trail) => {
        context.globalAlpha = (trailIndex + 1) * (0.22 / Math.max(1, trail.length));
        context.fillStyle = tint;
        context.beginPath();
        context.arc(position.x, position.y, 13, 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
      const intangible = snapshot.mode === GAME_MODES.PLAYING && snapshot.graceLeft > 0;
      drawAvatar(ghost.x, ghost.y, {
        ghost: true,
        index,
        label: `旧${ghost.sourceLevel}`,
        alpha: intangible ? 0.42 : 0.8
      });
    });
  }

  function drawHud(snapshot) {
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

  return {
    notify(events) {
      for (const event of events) {
        if (event.type === 'coin') spawnParticles(event.x, event.y, '#ffcf72', 10);
        if (event.type === 'lose') spawnParticles(event.x, event.y, '#ff6c9c', 26);
        if (event.type === 'clear') spawnParticles(event.x, event.y, '#68f5e5', 18);
      }
    },
    render(snapshot, deltaSeconds, time) {
      drawBackdrop(snapshot);
      snapshot.coins.forEach((coin, index) => drawCoin(coin, time, index));
      drawGhosts(snapshot);
      drawAvatar(snapshot.player.x, snapshot.player.y);
      drawHud(snapshot);
      drawParticles(deltaSeconds);
    }
  };
}
