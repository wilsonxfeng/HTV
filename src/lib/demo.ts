import { getPhase, normalizeHand } from './geometry';
import type { HandSide, MotionSession, Vec3 } from './types';

/** Deterministic illustrative anatomy. This function never represents camera data. */
export function makeDemoHand(amount: number, hand: HandSide = 'Right'): Vec3[] {
  const spread = Math.max(0, Math.min(1, amount));
  const points: Vec3[] = [{ x: 0, y: 0, z: 0 }];
  const thumbAngle = (-24 - spread * 29) * Math.PI / 180;
  points.push({ x: -0.26, y: 0.29, z: 0.13 }, { x: -0.49, y: 0.57, z: 0.18 });
  points.push({ x: -0.49 + Math.sin(thumbAngle) * 0.38, y: 0.57 + Math.cos(thumbAngle) * 0.38, z: 0.20 });
  points.push({ x: -0.49 + Math.sin(thumbAngle) * 0.69, y: 0.57 + Math.cos(thumbAngle) * 0.69, z: 0.17 });
  const bases = [
    { x: -0.48, y: 1.01, z: 0.01 }, { x: -0.15, y: 1.11, z: -0.025 },
    { x: 0.18, y: 1.06, z: -0.012 }, { x: 0.51, y: 0.94, z: 0.025 },
  ];
  const lengths = [1.24, 1.40, 1.30, 1.02];
  const neutralAngles = [-3, -1, 1.5, 5];
  const spreadAngles = [-19, -3, 15, 34];
  bases.forEach((base, finger) => {
    const angle = (neutralAngles[finger] + (spreadAngles[finger] - neutralAngles[finger]) * spread) * Math.PI / 180;
    points.push(base);
    [0.43, 0.75, 1].forEach((fraction, joint) => points.push({
      x: base.x + Math.sin(angle) * lengths[finger] * fraction,
      y: base.y + Math.cos(angle) * lengths[finger] * fraction,
      z: base.z + [0.035, 0.02, -0.025][joint] + Math.sin(spread * Math.PI) * 0.015,
    }));
  });
  // Both real hand identities share a thumb-left canonical display. The selected
  // identity is retained in session metadata and never inferred from this illustration.
  const physical = hand === 'Left' ? points.map(p => ({ x: -p.x, y: p.y, z: -p.z })) : points;
  return normalizeHand(physical);
}

function observedDemoHand(amount: number, repetition: number): Vec3[] {
  const hand = makeDemoHand(amount);
  // A deliberately restricted ring/pinky fan creates explainable sample differences.
  // This is authored example motion, not a simulated patient or medical finding.
  const reduction = [0.61, 0.67, 0.72][Math.min(2, repetition - 1)];
  const baseline = makeDemoHand(0);
  for (const base of [13, 17]) {
    for (let joint = base + 1; joint <= base + 3; joint++) {
      const current = hand[joint];
      const rest = baseline[joint];
      const factor = base === 17 ? reduction * 0.84 : reduction;
      hand[joint] = { x: rest.x + (current.x - rest.x) * factor, y: rest.y + (current.y - rest.y) * factor, z: rest.z + (current.z - rest.z) * factor };
    }
  }
  return hand;
}

export function createDemoSession(): MotionSession {
  const duration = 24;
  const cycleDuration = 8;
  const createdAt = new Date().toISOString();
  return {
    id: `demo-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
    createdAt, hand: 'Right', duration, cycleDuration, source: 'demo',
    calibration: { neutral: makeDemoHand(0), target: makeDemoHand(1), source: 'demo', hand: 'Right', createdAt },
    frames: Array.from({ length: duration * 30 + 1 }, (_, index) => {
      const t = index / 30;
      const phase = getPhase(t, cycleDuration);
      return { t, landmarks: observedDemoHand(phase.amount, phase.repetition), confidence: 1, tracking: true };
    }),
  };
}
