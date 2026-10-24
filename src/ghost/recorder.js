function point(time, position) {
  return {
    t: Number(time.toFixed(3)),
    x: Number(position.x.toFixed(2)),
    y: Number(position.y.toFixed(2))
  };
}

const EPSILON = 1e-9;

export class TrackRecorder {
  constructor(sampleInterval) {
    this.sampleInterval = sampleInterval;
    this.reset();
  }

  reset() {
    this.track = [];
    this.lastTime = -Infinity;
    this.lastPosition = null;
  }

  begin(startPosition) {
    this.track = [point(0, startPosition)];
    this.lastTime = 0;
    this.lastPosition = { x: startPosition.x, y: startPosition.y };
  }

  /**
   * 在固定时间网格（k * sampleInterval）上采样，保证采样时刻与帧率无关。
   * 调用方仍按任意时刻传入位置，采样点落在网格时刻上时用线性插值还原。
   */
  record(time, position, force = false) {
    if (!Number.isFinite(time)) return false;
    if (!force && (!this.lastPosition || time <= this.lastTime)) return false;

    if (force) {
      this.pushSample(time, position);
      this.lastTime = time;
      this.lastPosition = { x: position.x, y: position.y };
      return true;
    }

    const interval = this.sampleInterval;
    const startIndex = Math.floor(this.lastTime / interval + EPSILON) + 1;
    const endIndex = Math.floor(time / interval + EPSILON);
    let emitted = false;

    for (let index = startIndex; index <= endIndex; index += 1) {
      const sampleTime = index * interval;
      const span = Math.max(EPSILON, time - this.lastTime);
      const alpha = Math.min(1, (sampleTime - this.lastTime) / span);
      this.pushSample(sampleTime, {
        x: this.lastPosition.x + (position.x - this.lastPosition.x) * alpha,
        y: this.lastPosition.y + (position.y - this.lastPosition.y) * alpha
      });
      emitted = true;
    }

    this.lastTime = time;
    this.lastPosition = { x: position.x, y: position.y };
    return emitted;
  }

  pushSample(time, position) {
    const next = point(time, position);
    const previous = this.track[this.track.length - 1];
    if (previous && previous.t === next.t) {
      this.track[this.track.length - 1] = next;
    } else {
      this.track.push(next);
    }
  }

  finish(time, position) {
    this.record(time, position, true);
    return this.track.map((entry) => ({ ...entry }));
  }
}
