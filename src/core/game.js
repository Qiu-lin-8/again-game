import { GAME_CONFIG, clamp, distance } from './config.js';
import { collectCoins, createCoins } from './coin.js';
import { createPlayer, resetPlayer, updatePlayer } from './player.js';
import { GhostSystem } from '../ghost/ghost.js';
import { GAME_MODES, createIdleInput } from '../shared/contracts.js';

function readBest(storage) {
  try {
    const stored = Number(storage?.getItem(GAME_CONFIG.storageKey));
    return Number.isFinite(stored) && stored >= 1 ? Math.floor(stored) : 1;
  } catch {
    return 1;
  }
}

export class Game {
  constructor({ storage = globalThis.localStorage, random = Math.random, ghostSystem = new GhostSystem() } = {}) {
    this.storage = storage;
    this.random = random;
    this.ghostSystem = ghostSystem;
    this.events = [];
    this.state = {
      mode: GAME_MODES.MENU,
      level: 1,
      elapsed: 0,
      timeLeft: GAME_CONFIG.roundDuration,
      score: 0,
      best: readBest(storage),
      coinsGot: 0,
      goal: GAME_CONFIG.coinGoal,
      player: createPlayer(GAME_CONFIG.start, GAME_CONFIG.playerRadius),
      coins: createCoins(1, GAME_CONFIG.start, random),
      ghosts: [],
      arena: { ...GAME_CONFIG.arena },
      graceLeft: 0,
      outcome: null
    };
  }

  startRun() {
    this.ghostSystem.reset();
    this.state.level = 1;
    this.state.score = 0;
    this.events.length = 0;
    this.beginLevel();
  }

  beginLevel() {
    const state = this.state;
    state.mode = GAME_MODES.PLAYING;
    state.elapsed = 0;
    state.timeLeft = GAME_CONFIG.roundDuration;
    state.coinsGot = 0;
    state.coins = createCoins(state.level, GAME_CONFIG.start, this.random);
    state.outcome = null;
    resetPlayer(state.player, GAME_CONFIG.start);
    this.ghostSystem.beginLevel({ level: state.level, startPosition: state.player });
    state.ghosts = this.ghostSystem.getGhosts(0);
    state.graceLeft = state.ghosts.length > 0 ? GAME_CONFIG.gracePeriod : 0;
  }

  advance() {
    if (this.state.mode === GAME_MODES.CLEAR) {
      this.state.level += 1;
      this.beginLevel();
    } else if (this.state.mode !== GAME_MODES.PLAYING) {
      this.startRun();
    }
  }

  update(deltaSeconds, input = createIdleInput()) {
    const state = this.state;
    if (state.mode !== GAME_MODES.PLAYING) return;

    const delta = Number.isFinite(deltaSeconds) ? clamp(deltaSeconds, 0, 0.05) : 0;
    state.elapsed = Math.min(GAME_CONFIG.roundDuration, state.elapsed + delta);
    state.timeLeft = Math.max(0, GAME_CONFIG.roundDuration - state.elapsed);

    updatePlayer(state.player, input, delta, state.arena, GAME_CONFIG.speed);
    this.ghostSystem.recordPosition({ time: state.elapsed, position: state.player });
    state.ghosts = this.ghostSystem.getGhosts(state.elapsed);
    state.graceLeft = state.ghosts.length > 0
      ? Math.max(0, GAME_CONFIG.gracePeriod - state.elapsed)
      : 0;

    const collected = collectCoins(
      state.player,
      state.coins,
      GAME_CONFIG.playerRadius,
      GAME_CONFIG.coinRadius
    );
    for (const coin of collected) {
      state.coinsGot += 1;
      state.score += 100;
      this.events.push({ type: 'coin', x: coin.x, y: coin.y });
    }

    // Reaching the round deadline settles the level before collision checks. The
    // player has already fulfilled the rule of surviving for the full 10 seconds.
    if (state.elapsed >= GAME_CONFIG.roundDuration) {
      if (state.coinsGot >= state.goal) this.completeLevel();
      else this.lose('timeout');
      return;
    }

    if (state.graceLeft === 0) {
      const hit = state.ghosts.find((ghost) => (
        distance(state.player, ghost) < GAME_CONFIG.playerRadius + GAME_CONFIG.ghostRadius - 5
      ));
      if (hit) {
        this.lose('ghost', hit.sourceLevel);
        return;
      }
    }

  }

  completeLevel() {
    const state = this.state;
    this.ghostSystem.finishLevel({
      level: state.level,
      time: GAME_CONFIG.roundDuration,
      position: state.player
    });
    state.ghosts = this.ghostSystem.getGhosts(GAME_CONFIG.roundDuration);
    state.score += 150 + (state.coinsGot === GAME_CONFIG.coinCount ? 100 : 0);
    const finishedLevel = state.level;
    const nextLevel = finishedLevel + 1;
    state.best = Math.max(state.best, nextLevel);
    try {
      this.storage?.setItem(GAME_CONFIG.storageKey, String(state.best));
    } catch {
      // Storage is optional; gameplay must continue when it is unavailable.
    }
    state.mode = GAME_MODES.CLEAR;
    state.outcome = {
      kind: 'clear',
      finishedLevel,
      nextLevel,
      coinsGot: state.coinsGot,
      ghostCount: state.ghosts.length,
      score: state.score
    };
    this.events.push({ type: 'clear', x: state.player.x, y: state.player.y });
  }

  lose(reason, sourceLevel = null) {
    const state = this.state;
    state.mode = GAME_MODES.OVER;
    state.outcome = {
      kind: 'over',
      reason,
      sourceLevel,
      level: state.level,
      score: state.score,
      best: state.best
    };
    this.events.push({ type: 'lose', x: state.player.x, y: state.player.y });
  }

  consumeEvents() {
    return this.events.splice(0, this.events.length);
  }

  getSnapshot() {
    const state = this.state;
    return {
      mode: state.mode,
      level: state.level,
      elapsed: state.elapsed,
      timeLeft: state.timeLeft,
      score: state.score,
      best: state.best,
      coinsGot: state.coinsGot,
      goal: state.goal,
      player: { ...state.player },
      coins: state.coins.map((coin) => ({ ...coin })),
      ghosts: state.ghosts.map((ghost) => ({
        ...ghost,
        trail: ghost.trail?.map((point) => ({ ...point }))
      })),
      arena: { ...state.arena },
      graceLeft: state.graceLeft,
      outcome: state.outcome ? { ...state.outcome } : null
    };
  }
}
