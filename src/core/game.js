import { GAME_CONFIG, clamp, distance } from './config.js';
import { collectCoins, createCoins } from './coin.js';
import { createPlayer, resetPlayer, updatePlayer } from './player.js';
import { GhostSystem } from '../ghost/ghost.js';
import { GAME_MODES, createIdleInput } from '../shared/contracts.js';

function readBest(storage) {
  try {
    return Math.max(1, Number(storage?.getItem(GAME_CONFIG.storageKey) || 1) || 1);
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
      prepLeft: 0,
      shieldGrace: 0,
      previewCoins: null,
      outcome: null
    };
  }

  startRun() {
    this.ghostSystem.reset();
    this.state.level = 1;
    this.state.score = 0;
    this.state.previewCoins = null;
    this.events.length = 0;
    this.beginLevel();
  }

  beginLevel() {
    const state = this.state;
    state.mode = GAME_MODES.PLAYING;
    state.elapsed = 0;
    state.timeLeft = GAME_CONFIG.roundDuration;
    state.coinsGot = 0;
    state.coins = state.previewCoins
      ? state.previewCoins.map((coin) => ({ ...coin }))
      : createCoins(state.level, GAME_CONFIG.start, this.random);
    state.previewCoins = null;
    state.graceLeft = this.ghostSystem.count > 0 ? GAME_CONFIG.gracePeriod : 0;
    state.shieldGrace = 0;
    state.outcome = null;
    resetPlayer(state.player, GAME_CONFIG.start);
    this.ghostSystem.beginLevel({ level: state.level, startPosition: state.player });
    state.ghosts = this.ghostSystem.getGhosts(0);
  }

  advance() {
    const mode = this.state.mode;
    if (mode === GAME_MODES.PREP) {
      this.nextLevel();
    } else if (mode !== GAME_MODES.PLAYING) {
      this.startRun();
    }
  }

  nextLevel() {
    this.state.level += 1;
    this.beginLevel();
  }

  update(deltaSeconds, input = createIdleInput()) {
    const state = this.state;
    const delta = clamp(deltaSeconds, 0, 0.05);

    if (state.mode === GAME_MODES.PREP) {
      state.prepLeft = Math.max(0, state.prepLeft - delta);
      if (input.skill) this.ghostSystem.buySkill(input.skill);
      if (state.prepLeft <= 0) this.nextLevel();
      return;
    }

    if (state.mode !== GAME_MODES.PLAYING) return;

    state.elapsed = Math.min(GAME_CONFIG.roundDuration, state.elapsed + delta);
    state.timeLeft = Math.max(0, GAME_CONFIG.roundDuration - state.elapsed);
    state.graceLeft = Math.max(0, GAME_CONFIG.gracePeriod - state.elapsed);
    state.shieldGrace = Math.max(0, state.shieldGrace - delta);

    updatePlayer(state.player, input, delta, state.arena, GAME_CONFIG.speed);
    this.ghostSystem.recordPosition({ time: state.elapsed, position: state.player });
    state.ghosts = this.ghostSystem.getGhosts(state.elapsed);

    const radiusMult = this.ghostSystem.getCoinRadiusMult();
    const collected = collectCoins(
      state.player,
      state.coins,
      GAME_CONFIG.playerRadius * radiusMult,
      GAME_CONFIG.coinRadius * radiusMult
    );
    for (const coin of collected) {
      state.coinsGot += 1;
      state.score += 100;
      if (state.coinsGot === state.goal + 1) this.ghostSystem.addPoints(1);
      else if (state.coinsGot === state.goal + 2) this.ghostSystem.addPoints(2);
      this.events.push({ type: 'coin', x: coin.x, y: coin.y });
    }

    if (state.shieldGrace <= 0 && state.elapsed > GAME_CONFIG.gracePeriod) {
      const hit = state.ghosts.find((ghost) => (
        distance(state.player, ghost) < GAME_CONFIG.playerRadius + GAME_CONFIG.ghostRadius - 5
      ));
      if (hit) {
        if (this.ghostSystem.consumeShield()) {
          this.ghostSystem.forgiveGhost(hit.sourceLevel);
          state.ghosts = this.ghostSystem.getGhosts(state.elapsed);
          state.shieldGrace = GAME_CONFIG.shieldInvincibility;
          this.events.push({ type: 'shield', x: hit.x, y: hit.y });
        } else {
          this.lose('ghost', hit.sourceLevel);
          return;
        }
      }
    }

    if (state.elapsed >= GAME_CONFIG.roundDuration) {
      if (state.coinsGot >= state.goal) this.completeLevel();
      else this.lose('timeout');
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
    state.prepLeft = GAME_CONFIG.prepDuration;
    state.mode = GAME_MODES.PREP;
    state.previewCoins = createCoins(nextLevel, GAME_CONFIG.start, this.random);
    state.outcome = {
      kind: 'clear',
      finishedLevel,
      nextLevel,
      coinsGot: state.coinsGot,
      ghostCount: this.ghostSystem.count,
      score: state.score,
      points: this.ghostSystem.getPoints()
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
      prepLeft: state.prepLeft,
      points: this.ghostSystem.getPoints(),
      pointCap: this.ghostSystem.getPointCap(),
      skills: this.ghostSystem.getSkills(),
      previewCoins: state.previewCoins
        ? state.previewCoins.map((coin) => ({ ...coin }))
        : null,
      previewPaths: this.ghostSystem.getPreviewPaths(),
      shieldGrace: state.shieldGrace,
      outcome: state.outcome ? { ...state.outcome } : null
    };
  }
}
