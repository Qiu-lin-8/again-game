import { clamp } from './config.js';

export function createPlayer(start, radius) {
  return { x: start.x, y: start.y, radius };
}

export function resetPlayer(player, start) {
  player.x = start.x;
  player.y = start.y;
}

export function updatePlayer(player, input, deltaSeconds, arena, speed) {
  const dxKey = Number(input.right) - Number(input.left);
  const dyKey = Number(input.down) - Number(input.up);

  if (dxKey !== 0 || dyKey !== 0) {
    const length = Math.hypot(dxKey, dyKey);
    player.x += (dxKey / length) * speed * deltaSeconds;
    player.y += (dyKey / length) * speed * deltaSeconds;
  } else if (input.pointer.active) {
    const dx = input.pointer.x - player.x;
    const dy = input.pointer.y - player.y;
    const length = Math.hypot(dx, dy);
    const step = Math.min(length, speed * deltaSeconds);
    if (length > 1) {
      player.x += (dx / length) * step;
      player.y += (dy / length) * step;
    }
  }

  const margin = player.radius + 4;
  player.x = clamp(player.x, arena.x + margin, arena.x + arena.w - margin);
  player.y = clamp(player.y, arena.y + margin, arena.y + arena.h - margin);
}
