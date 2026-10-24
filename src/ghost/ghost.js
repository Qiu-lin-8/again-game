import { GAME_CONFIG } from '../core/config.js';
import { TrackRecorder } from './recorder.js';
import { interpolateTrack } from './replay.js';

export class GhostSystem {
  constructor({ sampleInterval = GAME_CONFIG.sampleInterval } = {}) {
    this.recorder = new TrackRecorder(sampleInterval);
    this.reset();
  }

  reset() {
    this.history = [];
    this.activeLevel = null;
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
    return { id: recording.id, sourceLevel: recording.sourceLevel };
  }

  getGhosts(time) {
    return this.history.map((recording) => {
      const position = interpolateTrack(recording.track, time);
      const trail = [4, 3, 2, 1]
        .map((step) => interpolateTrack(recording.track, Math.max(0, time - step * 0.11)))
        .filter(Boolean);
      return {
        id: recording.id,
        sourceLevel: recording.sourceLevel,
        x: position.x,
        y: position.y,
        trail
      };
    });
  }

  get count() {
    return this.history.length;
  }
}
