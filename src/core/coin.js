import { clamp, distance } from './config.js';

const FIRST_LEVEL_POSITIONS = Object.freeze([
  [365, 260], [478, 145], [605, 270], [703, 398], [262, 390]
]);

const LATER_LEVEL_POSITIONS = Object.freeze([
  [324, 160], [640, 170], [290, 375], [638, 382],
  [490, 430], [760, 270], [200, 250], [485, 120]
]);

function randomBetween(random, min, max) {
  return min + random() * (max - min);
}

export function createCoins(level, start, random = Math.random) {
  if (level === 1) {
    return FIRST_LEVEL_POSITIONS.map(([x, y]) => ({ x, y, taken: false }));
  }

  const coins = [];
  let attempts = 0;
  while (coins.length < 5 && attempts < 300) {
    attempts += 1;
    const base = LATER_LEVEL_POSITIONS[Math.floor(random() * LATER_LEVEL_POSITIONS.length)];
    const coin = {
      x: clamp(base[0] + randomBetween(random, -52, 52), 78, 882),
      y: clamp(base[1] + randomBetween(random, -47, 47), 75, 466),
      taken: false
    };
    if (distance(coin, start) < 93 || coins.some((other) => distance(other, coin) < 115)) continue;
    coins.push(coin);
  }

  for (const [x, y] of LATER_LEVEL_POSITIONS) {
    if (coins.length === 5) break;
    const coin = { x, y, taken: false };
    if (!coins.some((other) => distance(other, coin) < 80)) coins.push(coin);
  }

  return coins.slice(0, 5);
}

export function collectCoins(player, coins, playerRadius, coinRadius) {
  const collected = [];
  for (const coin of coins) {
    if (!coin.taken && distance(player, coin) < playerRadius + coinRadius + 2) {
      coin.taken = true;
      collected.push(coin);
    }
  }
  return collected;
}
