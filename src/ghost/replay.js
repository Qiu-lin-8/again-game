import { clamp } from '../core/config.js';

export function interpolateTrack(track, time) {
  if (!track || track.length === 0) return null;
  if (time <= track[0].t) return { x: track[0].x, y: track[0].y };

  const end = track[track.length - 1];
  if (time >= end.t) return { x: end.x, y: end.y };

  let low = 0;
  let high = track.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (track[middle].t < time) low = middle;
    else high = middle;
  }

  const from = track[low];
  const to = track[high];
  const alpha = clamp((time - from.t) / Math.max(0.0001, to.t - from.t), 0, 1);
  return {
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha
  };
}
