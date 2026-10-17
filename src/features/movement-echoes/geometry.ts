import type { EchoFrame, Palm, Point, Repetition } from './types';

export const clamp = (v: number, lo = 0, hi = 1) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
export function timeToPhase(t: number, rep: Repetition) {
  if (t <= rep.peakMs)
    return (
      0.5 * clamp((t - rep.startMs) / Math.max(1, rep.peakMs - rep.startMs))
    );
  return (
    0.5 + 0.5 * clamp((t - rep.peakMs) / Math.max(1, rep.endMs - rep.peakMs))
  );
}
export function phaseToTime(p: number, rep: Repetition) {
  p = clamp(p);
  return p <= 0.5
    ? rep.startMs + 2 * p * (rep.peakMs - rep.startMs)
    : rep.peakMs + 2 * (p - 0.5) * (rep.endMs - rep.peakMs);
}
export const palmAnchors = (
  points: Point[],
  width: number,
  height: number,
): Palm =>
  [0, 5, 9, 17].map((i) => ({
    x: points[i].x * width,
    y: points[i].y * height,
  })) as Palm;

export interface Similarity {
  a: number;
  b: number;
  tx: number;
  ty: number;
  error: number;
  scale: number;
}
/** Least-squares, orientation-preserving similarity; never a per-finger warp. */
export function fitPalm(source: Palm, target: Palm): Similarity | null {
  const centroid = (p: Palm) => ({
    x: p.reduce((s, v) => s + v.x, 0) / 4,
    y: p.reduce((s, v) => s + v.y, 0) / 4,
  });
  const s = centroid(source),
    t = centroid(target);
  let dot = 0,
    cross = 0,
    den = 0;
  for (let i = 0; i < 4; i++) {
    const x = source[i].x - s.x,
      y = source[i].y - s.y,
      u = target[i].x - t.x,
      v = target[i].y - t.y;
    dot += x * u + y * v;
    cross += x * v - y * u;
    den += x * x + y * y;
  }
  if (den < 1e-6) return null;
  const a = dot / den,
    b = cross / den,
    tx = t.x - a * s.x + b * s.y,
    ty = t.y - b * s.x - a * s.y;
  const scale = Math.hypot(a, b);
  const error = Math.sqrt(
    source.reduce(
      (sum, p, i) =>
        sum +
        (a * p.x - b * p.y + tx - target[i].x) ** 2 +
        (b * p.x + a * p.y + ty - target[i].y) ** 2,
      0,
    ) / 4,
  );
  return { a, b, tx, ty, error, scale };
}
export function inversePoint(p: Point, m: Similarity): Point {
  const d = m.a * m.a + m.b * m.b;
  return {
    x: (m.a * (p.x - m.tx) + m.b * (p.y - m.ty)) / d,
    y: (-m.b * (p.x - m.tx) + m.a * (p.y - m.ty)) / d,
  };
}
/** No interpolation through missing inference; encoded-video timestamps are authoritative. */
export function frameAtTime(
  frames: EchoFrame[],
  tMs: number,
): EchoFrame | null {
  let lo = 0,
    hi = frames.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >>> 1;
    if (frames[m].tMs < tMs) lo = m + 1;
    else hi = m - 1;
  }
  const a = frames[hi],
    b = frames[lo];
  if (a?.valid && Math.abs(a.tMs - tMs) < 1) return a;
  if (b?.valid && Math.abs(b.tMs - tMs) < 1) return b;
  if (!a?.valid || !b?.valid || b.tMs - a.tMs > 250) return null;
  const f = clamp((tMs - a.tMs) / (b.tMs - a.tMs));
  return {
    ...a,
    tMs,
    image: a.image.map((p, i) => ({
      x: p.x + (b.image[i].x - p.x) * f,
      y: p.y + (b.image[i].y - p.y) * f,
      z: p.z + (b.image[i].z - p.z) * f,
    })),
  };
}

/** Hysteresis on measured spread. Prefer complete cycles and tracking, never maximum ROM. */
export function detectRepetitions(frames: EchoFrame[]): Repetition[] {
  const valid = frames.filter((f) => f.valid && f.spread !== null);
  if (valid.length < 10) return [];
  const values = valid.map((f) => f.spread!).sort((a, b) => a - b);
  const low = values[Math.floor(values.length * 0.1)],
    high = values[Math.floor(values.length * 0.9)];
  if (high - low < 2) return [];
  const smoothed = frames.map((f, i) => {
    const neighbours = frames
      .slice(Math.max(0, i - 2), i + 3)
      .filter((v) => v.valid && v.spread !== null);
    return f.valid && neighbours.length
      ? neighbours.reduce((s, v) => s + v.spread!, 0) / neighbours.length
      : null;
  });
  const threshold = low + (high - low) * 0.27;
  const reps: Repetition[] = [];
  let start = -1,
    peak = -1,
    peakValue = -Infinity,
    opening = false;
  for (let i = 0; i < frames.length; i++) {
    const v = smoothed[i];
    if (v === null) continue;
    if (!opening) {
      if (v <= threshold) start = i;
      else if (start >= 0) {
        opening = true;
        peak = i;
        peakValue = v;
      }
    } else {
      if (v > peakValue) {
        peakValue = v;
        peak = i;
      }
      if (v <= threshold && frames[i].tMs - frames[peak].tMs > 200) {
        const subset = frames.slice(start, i + 1);
        const coverage = subset.filter((f) => f.valid).length / subset.length;
        const complete =
          frames[peak].tMs - frames[start].tMs >= 200 &&
          peakValue - low >= (high - low) * 0.5 &&
          coverage >= 0.8;
        if (complete)
          reps.push({
            startMs: frames[start].tMs,
            peakMs: frames[peak].tMs,
            endMs: frames[i].tMs,
            coverage,
            peakSpread: frames[peak].spread!,
            valid: true,
          });
        opening = false;
        start = i;
        peakValue = -Infinity;
      }
    }
  }
  return reps;
}
export const representativeRep = (reps: Repetition[]) =>
  reps.reduce(
    (best, r, i) =>
      r.valid && r.coverage > (reps[best]?.coverage ?? -1) ? i : best,
    0,
  );
export function compatible(
  a: {
    trackingMode?: string;
    cameraView?: string;
    analysisVersion?: string;
    exerciseId: string;
    selectedHand: string;
    mirrored: boolean;
    demonstration?: boolean;
    comparisonGroup?: string;
  },
  b: {
    trackingMode?: string;
    cameraView?: string;
    analysisVersion?: string;
    exerciseId: string;
    selectedHand: string;
    mirrored: boolean;
    demonstration?: boolean;
    comparisonGroup?: string;
  },
) {
  if (
    (a.trackingMode ?? 'hand') !== (b.trackingMode ?? 'hand') ||
    Boolean(a.demonstration) !== Boolean(b.demonstration) ||
    a.cameraView !== b.cameraView ||
    a.analysisVersion !== b.analysisVersion ||
    a.exerciseId !== b.exerciseId ||
    a.selectedHand !== b.selectedHand ||
    a.mirrored !== b.mirrored
  )
    return false;
  if (a.selectedHand === 'Unconfirmed')
    return Boolean(
      a.demonstration &&
        b.demonstration &&
        a.comparisonGroup &&
        a.comparisonGroup === b.comparisonGroup,
    );
  return true;
}
