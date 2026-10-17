import { describe, expect, it } from 'vitest';
import { averageHands, clinicianTarget, frameAt, getPhase, interpolateHand, normalizeHand, pairAngles, referenceAt } from './geometry';
import { createDemoSession, makeDemoHand } from './demo';
import type { HandFrame, Vec3 } from './types';

function expectHandsClose(a: Vec3[], b: Vec3[]): void {
  expect(a).toHaveLength(21);
  expect(b).toHaveLength(21);
  a.forEach((p, i) => {
    expect(p.x).toBeCloseTo(b[i].x, 8);
    expect(p.y).toBeCloseTo(b[i].y, 8);
    expect(p.z).toBeCloseTo(b[i].z, 8);
  });
}

function transformed(p: Vec3): Vec3 {
  const y = p.y * Math.cos(0.7) - p.z * Math.sin(0.7);
  const z = p.y * Math.sin(0.7) + p.z * Math.cos(0.7);
  const x = p.x * Math.cos(-1.2) - y * Math.sin(-1.2);
  const rotatedY = p.x * Math.sin(-1.2) + y * Math.cos(-1.2);
  return { x: x * 0.073 + 8, y: rotatedY * 0.073 - 4, z: z * 0.073 + 13 };
}

const frame = (t: number, amount = 0, tracking = true): HandFrame => ({ t, landmarks: makeDemoHand(amount), confidence: 0.9, tracking });

describe('palm coordinates and 3D angles', () => {
  it('removes translation, uniform scale, and arbitrary rigid camera rotation', () => {
    const hand = makeDemoHand(0.7);
    expectHandsClose(normalizeHand(hand.map(transformed)), normalizeHand(hand));
    const before = pairAngles(hand);
    const after = pairAngles(hand.map(transformed));
    before.forEach((angle, i) => expect(angle).toBeCloseTo(after[i], 8));
  });

  it('keeps wrist at zero, thumb left, MCP width one, and real depth variation', () => {
    const hand = normalizeHand(makeDemoHand(1));
    expect(hand[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(hand[4].x).toBeLessThan(0);
    const a = hand[5]; const b = hand[17];
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeCloseTo(1, 10);
    expect(Math.max(...hand.map(p => p.z)) - Math.min(...hand.map(p => p.z))).toBeGreaterThan(0.1);
    expectHandsClose(makeDemoHand(1, 'Left'), makeDemoHand(1, 'Right'));
  });

  it('computes known adjacent finger axis angles, including depth', () => {
    const hand = makeDemoHand(0);
    [2, 5, 9, 13, 17].forEach((base, i) => {
      const angle = [-30, -15, 0, 20, 45][i] * Math.PI / 180;
      const tip = [4, 8, 12, 16, 20][i];
      hand[tip] = { x: hand[base].x + Math.sin(angle), y: hand[base].y + Math.cos(angle), z: hand[base].z };
    });
    pairAngles(hand).forEach((value, i) => expect(value).toBeCloseTo([15, 15, 20, 25][i], 8));
    hand[12] = { x: hand[9].x, y: hand[9].y, z: hand[9].z + 1 };
    expect(pairAngles(hand)[1]).toBeCloseTo(90, 8);
    expect(pairAngles(hand)[2]).toBeCloseTo(90, 8);
  });

  it('rejects missing, non-finite, and degenerate geometry without fabricated points', () => {
    expect(normalizeHand([])).toEqual([]);
    expect(normalizeHand(Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })))).toEqual([]);
    const invalid = makeDemoHand(0); invalid[4].z = Number.NaN;
    expect(pairAngles(invalid)).toEqual([]);
    expect(normalizeHand(invalid)).toEqual([]);
    const zeroAxis = makeDemoHand(0); zeroAxis[8] = zeroAxis[5];
    expect(pairAngles(zeroAxis)).toEqual([]);
  });

  it('constructs prescribed adjacent angles while preserving measured finger bone lengths', () => {
    const neutral = makeDemoHand(0);
    const target = clinicianTarget(neutral, [12, 18, 22]);
    pairAngles(target).slice(1).forEach((angle, i) => expect(angle).toBeCloseTo([12, 18, 22][i], 7));
    [5, 9, 13, 17].forEach(base => {
      expect(target[base]).toEqual(neutral[base]);
      for (let joint = base + 1; joint <= base + 3; joint++) {
        const distance = (points: Vec3[]) => Math.hypot(points[joint].x - points[joint - 1].x, points[joint].y - points[joint - 1].y, points[joint].z - points[joint - 1].z);
        expect(distance(target)).toBeCloseTo(distance(neutral), 9);
      }
    });
    expect(clinicianTarget([], [12, 18, 22])).toEqual([]);
    expect(clinicianTarget(neutral, [-5, 18, 22])).toEqual([]);
  });
});

describe('reference timing and replay', () => {
  it('uses continuous spread/close phases and honors configurable duration', () => {
    expect(getPhase(0).name).toBe('Together');
    expect(getPhase(2).name).toBe('Spread');
    expect(getPhase(4).amount).toBe(1);
    expect(getPhase(6).name).toBe('Close');
    expect(getPhase(8).repetition).toBe(2);
    expect(getPhase(3, 6).name).toBe('Hold');
    expect(getPhase(8 - 1e-6).amount).toBeCloseTo(getPhase(8).amount, 8);
    expect(getPhase(3.6 - 1e-6).amount).toBeCloseTo(getPhase(3.6).amount, 8);
    const calibration = createDemoSession().calibration;
    expectHandsClose(referenceAt(calibration, 0), calibration.neutral);
    expectHandsClose(referenceAt(calibration, 4), calibration.target);
  });

  it('interpolates only a contiguous interval containing two tracked observations', () => {
    const frames = [frame(0, 0), frame(0.1, 1)];
    expectHandsClose(frameAt(frames, 0.05)!.landmarks, interpolateHand(frames[0].landmarks, frames[1].landmarks, 0.5));
    expect(frameAt(frames, -0.1)).toBeNull();
    expect(frameAt(frames, 0.11)).toBeNull();
    expect(frameAt([frame(0), frame(0.1, 0, false), frame(0.2)], 0.05)).toBeNull();
    expect(frameAt([frame(0), frame(0.1, 0, false), frame(0.2)], 0.15)).toBeNull();
    expect(frameAt([frame(0), frame(2)], 1)).toBeNull();
    expect(frameAt([frame(0), frame(2)], 2)?.t).toBe(2);
    expect(frameAt([], 0)).toBeNull();
  });

  it('averages complete observed hands and excludes corrupt samples', () => {
    const a = makeDemoHand(0); const b = makeDemoHand(1);
    expectHandsClose(averageHands([a, [], b]), interpolateHand(a, b, 0.5));
    expect(averageHands([])).toEqual([]);
  });
});
