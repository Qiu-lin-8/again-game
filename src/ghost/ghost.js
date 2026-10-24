import { GAME_CONFIG } from '../core/config.js';
import { TrackRecorder } from './recorder.js';
import { interpolateTrack } from './replay.js';

const MAGNET_RADIUS_MULT = 2;
const POINT_CAP = 9;

const SKILLS = Object.freeze([
  Object.freeze({ id: 'magnet', name: '金币磁铁', icon: '🧲', cost: 3, desc: '本关收集半径翻倍' }),
  Object.freeze({ id: 'forgive', name: '原谅过去的自己', icon: '🙏', cost: 4, desc: '清除最久远的幽灵' }),
  Object.freeze({ id: 'shield', name: '替身免死', icon: '🛡️', cost: 5, desc: '首次撞幽灵反杀' })
]);

export class GhostSystem {
  constructor({ sampleInterval = GAME_CONFIG.sampleInterval } = {}) {
    this.recorder = new TrackRecorder(sampleInterval);
    this.reset();
  }

  reset() {
    this.history = [];
    this.activeLevel = null;
    this.points = 0;
    this.magnetActive = false;
    this.shield = false;
    this.recorder.reset();
  }

  beginLevel({ level, startPosition }) {
    this.activeLevel = level;
    this.recorder.begin(startPosition);
  }

  recordPosition({ time, position }) {
    this.recorder.record(time, position);
  }

  finishLevel({ level = this.activeLevel, time, position }) {
    if (level == null) throw new Error('beginLevel() must be called before finishLevel().');
    const recording = {
      id: `ghost-${level}`,
      sourceLevel: level,
      track: this.recorder.finish(time, position)
    };
    this.history.push(recording);
    this.activeLevel = null;
    this.magnetActive = false;
    return { id: recording.id, sourceLevel: recording.sourceLevel };
  }

  forgiveGhost(sourceLevel) {
    const index = this.history.findIndex((recording) => recording.sourceLevel === sourceLevel);
    if (index === -1) return false;
    this.history.splice(index, 1);
    return true;
  }

  getGhosts(time) {
    const ghosts = [];
    for (const recording of this.history) {
      const position = interpolateTrack(recording.track, time);
      if (!position) continue;
      const trail = [4, 3, 2, 1]
        .map((step) => interpolateTrack(recording.track, Math.max(0, time - step * 0.11)))
        .filter(Boolean);
      ghosts.push({
        id: recording.id,
        sourceLevel: recording.sourceLevel,
        x: position.x,
        y: position.y,
        trail
      });
    }
    return ghosts;
  }

  get count() {
    return this.history.length;
  }

  // ===== 积分 & 技能（B 拥有，A 调用） =====
  getPoints() {
    return this.points;
  }

  getPointCap() {
    return POINT_CAP;
  }

  addPoints(n) {
    this.points = Math.min(POINT_CAP, this.points + n);
  }

  getSkills() {
    return SKILLS.map((skill) => ({
      ...skill,
      active: skill.id === 'magnet' ? this.magnetActive : skill.id === 'shield' ? this.shield : false
    }));
  }

  buySkill(id) {
    const skill = SKILLS.find((entry) => entry.id === id);
    if (!skill) return { ok: false, reason: 'unknown' };
    if (this.points < skill.cost) return { ok: false, reason: 'points' };
    if (id === 'magnet') {
      if (this.magnetActive) return { ok: false, reason: 'active' };
      this.magnetActive = true;
    } else if (id === 'forgive') {
      if (this.history.length === 0) return { ok: false, reason: 'no-ghost' };
      this.history.shift();
    } else if (id === 'shield') {
      if (this.shield) return { ok: false, reason: 'active' };
      this.shield = true;
    }
    this.points -= skill.cost;
    return { ok: true };
  }

  getCoinRadiusMult() {
    return this.magnetActive ? MAGNET_RADIUS_MULT : 1;
  }

  consumeShield() {
    if (!this.shield) return false;
    this.shield = false;
    return true;
  }

  getPreviewPaths() {
    return this.history.map((recording) => ({
      id: recording.id,
      sourceLevel: recording.sourceLevel,
      points: recording.track.map((entry) => ({ x: entry.x, y: entry.y }))
    }));
  }
}
