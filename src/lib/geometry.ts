import type { Calibration, HandFrame, Phase, Vec3 } from './types';

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
  [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export const FINGER_PAIRS: { name: string; indices: [number, number] }[] = [
  { name: 'Thumb–Index', indices: [4, 8] },
  { name: 'Index–Middle', indices: [8, 12] },
  { name: 'Middle–Ring', indices: [12, 16] },
  { name: 'Ring–Pinky', indices: [16, 20] },
];

const FINGER_BASES = [2, 5, 9, 13, 17];
const FINGER_TIPS = [4, 8, 12, 16, 20];
const EPSILON = 1e-8;
/** A longer absence is shown as a tracking gap, never filled with motion. */
export const MAX_FRAME_GAP = 0.2;

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const scale = (a: Vec3, n: number): Vec3 => ({ x: a.x * n, y: a.y * n, z: a.z * n });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec3): Vec3 => scale(a, 1 / length(a));
const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));

export function isValidHand(hand: Vec3[] | undefined): hand is Vec3[] {
  return !!hand && hand.length === 21 && hand.every(p =>
    p != null && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
}

/** Wrist-local, orthonormal palm coordinates. X points index→pinky, Y toward fingers.
 * Uniform scale and rigid camera pose are removed; all three spatial dimensions remain.
 * This is a canonical display, not a claim about anatomical left/right identity.
 */
export function normalizeHand(world: Vec3[]): Vec3[] {
  if (!isValidHand(world)) return [];
  const lateral = sub(world[17], world[5]);
  const width = length(lateral);
  if (width < EPSILON) return [];
  const x = unit(lateral);
  const towardFingers = sub(world[9], world[0]);
  const orthogonalY = sub(towardFingers, scale(x, dot(towardFingers, x)));
  if (length(orthogonalY) < EPSILON) return [];
  const y = unit(orthogonalY);
  const z = unit(cross(x, y));
  return world.map(p => {
    const local = sub(p, world[0]);
    return { x: dot(local, x) / width, y: dot(local, y) / width, z: dot(local, z) / width };
  });
}

/** Adjacent 3D finger-axis angles in degrees. The thumb axis is MCP→tip;
 * other axes are MCP→tip. These are geometric estimates, not joint ROM measures.
 */
export function pairAngles(landmarks: Vec3[]): number[] {
  if (!isValidHand(landmarks)) return [];
  const axes = FINGER_TIPS.map((tip, i) => sub(landmarks[tip], landmarks[FINGER_BASES[i]]));
  if (axes.some(axis => length(axis) < EPSILON)) return [];
  return axes.slice(0, -1).map((axis, i) =>
    Math.acos(clamp(dot(unit(axis), unit(axes[i + 1])), -1, 1)) * 180 / Math.PI);
}

export function interpolateHand(a: Vec3[], b: Vec3[], amount: number): Vec3[] {
  if (!isValidHand(a) || !isValidHand(b) || !Number.isFinite(amount)) return [];
  const t = clamp(amount, 0, 1);
  return a.map((p, i) => ({ x: p.x + (b[i].x - p.x) * t, y: p.y + (b[i].y - p.y) * t, z: p.z + (b[i].z - p.z) * t }));
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

export function getPhase(t: number, cycleDuration = 8): Phase {
  const duration = Number.isFinite(cycleDuration) && cycleDuration > 0 ? cycleDuration : 8;
  const time = Math.max(0, Number.isFinite(t) ? t : 0);
  const progress = (time % duration) / duration;
  const repetition = Math.floor(time / duration) + 1;
  if (progress < 0.1) return { name: 'Together', amount: 0, repetition, progress };
  if (progress < 0.45) return { name: 'Spread', amount: smooth((progress - 0.1) / 0.35), repetition, progress };
  if (progress < 0.65) return { name: 'Hold', amount: 1, repetition, progress };
  return { name: 'Close', amount: 1 - smooth((progress - 0.65) / 0.35), repetition, progress };
}

export function referenceAt(calibration: Calibration, t: number, cycleDuration = 8): Vec3[] {
  return interpolateHand(calibration.neutral, calibration.target, getPhase(t, cycleDuration).amount);
}

export function validFrame(frame: HandFrame | undefined): frame is HandFrame {
  return !!frame && frame.tracking && Number.isFinite(frame.t) && isValidHand(frame.landmarks) && pairAngles(frame.landmarks).length === 4;
}

/** Frames must be time ordered. No extrapolation, interpolation through lost tracking,
 * or interpolation over a long interval. Exact observed timestamps remain replayable.
 */
export function frameAt(frames: HandFrame[], t: number): HandFrame | null {
  if (!Number.isFinite(t) || frames.length === 0 || t < frames[0].t || t > frames[frames.length - 1].t) return null;
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (frames[mid].t === t) return validFrame(frames[mid]) ? frames[mid] : null;
    if (frames[mid].t < t) low = mid + 1;
    else high = mid - 1;
  }
  const a = frames[high];
  const b = frames[low];
  if (!validFrame(a) || !validFrame(b) || b.t - a.t > MAX_FRAME_GAP || b.t <= a.t) return null;
  const amount = (t - a.t) / (b.t - a.t);
  return {
    ...a, t, landmarks: interpolateHand(a.landmarks, b.landmarks, amount),
    worldLandmarks: a.worldLandmarks && b.worldLandmarks ? interpolateHand(a.worldLandmarks, b.worldLandmarks, amount) : undefined,
    imageLandmarks: a.imageLandmarks && b.imageLandmarks ? interpolateHand(a.imageLandmarks, b.imageLandmarks, amount) : undefined,
    confidence: Math.min(a.confidence, b.confidence),
  };
}

export function averageHands(frames: Vec3[][]): Vec3[] {
  const valid = frames.filter(isValidHand);
  if (!valid.length) return [];
  return Array.from({ length: 21 }, (_, i) => {
    const total = valid.reduce((sum, hand) => add(sum, hand[i]), { x: 0, y: 0, z: 0 });
    return scale(total, 1 / valid.length);
  });
}

/** Rotate a measured finger, preserving its bone lengths and shape. */
function rotateFromTo(vector: Vec3, from: Vec3, to: Vec3): Vec3 {
  const axis = cross(from, to);
  const cosine = clamp(dot(from, to), -1, 1);
  if (length(axis) < EPSILON) return vector;
  const k = unit(axis);
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  return add(add(scale(vector, cosine), scale(cross(k, vector), sine)), scale(k, dot(k, vector) * (1 - cosine)));
}

/** A clinician-configured illustration built from measured neutral anatomy.
 * Gaps are index–middle, middle–ring, and ring–pinky angles in degrees.
 * The app must label this supplied target; it is not a population norm.
 */
export function clinicianTarget(neutral: Vec3[], gaps: [number, number, number]): Vec3[] {
  if (!isValidHand(neutral) || pairAngles(neutral).length !== 4 ||
      gaps.some(n => !Number.isFinite(n) || n < 0 || n > 60) || gaps[1] + gaps[2] > 100) return [];
  const y = unit(sub(neutral[12], neutral[9]));
  const lateral = sub(neutral[17], neutral[5]);
  const projected = sub(lateral, scale(y, dot(lateral, y)));
  if (length(projected) < EPSILON) return [];
  const x = unit(projected);
  const result = neutral.map(p => ({ ...p }));
  const angles = [-gaps[0], 0, gaps[1], gaps[1] + gaps[2]];
  [5, 9, 13, 17].forEach((base, i) => {
    if (i === 1) return;
    const radians = angles[i] * Math.PI / 180;
    const desired = add(scale(y, Math.cos(radians)), scale(x, Math.sin(radians)));
    const original = unit(sub(neutral[base + 3], neutral[base]));
    for (let point = base + 1; point <= base + 3; point++) {
      result[point] = add(neutral[base], rotateFromTo(sub(neutral[point], neutral[base]), original, desired));
    }
  });
  return result;
}
