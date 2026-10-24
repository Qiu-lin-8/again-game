function point(time, position) {
  return {
    t: Number(time.toFixed(3)),
    x: Number(position.x.toFixed(2)),
    y: Number(position.y.toFixed(2))
  };
}

export class TrackRecorder {
  constructor(sampleInterval) {
    this.sampleInterval = sampleInterval;
    this.reset();
  }

  reset() {
    this.track = [];
    this.lastSample = -Infinity;
  }

  begin(startPosition) {
    this.track = [point(0, startPosition)];
    this.lastSample = 0;
  }

  record(time, position, force = false) {
    if (!force && time - this.lastSample < this.sampleInterval) return false;
    const next = point(time, position);
    const previous = this.track[this.track.length - 1];
    if (force && previous?.t === next.t) this.track[this.track.length - 1] = next;
    else this.track.push(next);
    this.lastSample = time;
    return true;
  }

  finish(time, position) {
    this.record(time, position, true);
    return this.track.map((entry) => ({ ...entry }));
  }
}
