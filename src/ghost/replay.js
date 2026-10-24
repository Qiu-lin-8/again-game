import { clamp } from '../core/config.js';

export function interpolateTrack(track, time) {
  if (!track || track.length === 0) return null;
  if (!Number.isFinite(time)) return null;
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
  const span = to.t - from.t;
  if (span <= 0) return { x: to.x, y: to.y };

  const alpha = clamp((time - from.t) / span, 0, 1);
  if (alpha === 0) return { x: from.x, y: from.y };
  if (alpha === 1) return { x: to.x, y: to.y };
  return {
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha
  };
}
