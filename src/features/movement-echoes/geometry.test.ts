import { describe, expect, it } from 'vitest';
import {
  compatible,
  detectRepetitions,
  fitPalm,
  frameAtTime,
  inversePoint,
  phaseToTime,
  representativeRep,
  timeToPhase,
} from './geometry';
import type { EchoFrame, Palm, Repetition } from './types';

const rep: Repetition = {
  startMs: 1000,
  peakMs: 3000,
  endMs: 4000,
  valid: true,
  coverage: 1,
  peakSpread: 20,
};
describe('phase alignment', () => {
  it('maps asymmetric opening and closing intervals to matching phases', () => {
    expect(timeToPhase(2000, rep)).toBe(0.25);
    expect(timeToPhase(3500, rep)).toBe(0.75);
    const slower = { ...rep, startMs: 0, peakMs: 6000, endMs: 10000 };
    expect(phaseToTime(timeToPhase(3500, rep), slower)).toBe(8000);
  });
  it('round trips phases, clamps endpoints and handles degenerate intervals', () => {
    for (let p = 0; p <= 1; p += 0.05)
      expect(timeToPhase(phaseToTime(p, rep), rep)).toBeCloseTo(p);
    expect(timeToPhase(-200, rep)).toBe(0);
    expect(timeToPhase(9000, rep)).toBe(1);
    expect(
      Number.isFinite(
        timeToPhase(1000, { ...rep, startMs: 1000, peakMs: 1000, endMs: 1000 }),
      ),
    ).toBe(true);
  });
});
describe('palm-only alignment', () => {
  const source: Palm = [
    { x: 10, y: 40 },
    { x: 0, y: 0 },
    { x: 20, y: -5 },
    { x: 40, y: 0 },
  ];
  it('recovers rotation, uniform scale and translation without changing proportions', () => {
    const a = 1.8 * Math.cos(0.4),
      b = 1.8 * Math.sin(0.4);
    const target = source.map((p) => ({
      x: a * p.x - b * p.y + 140,
      y: b * p.x + a * p.y + 95,
    })) as Palm;
    const fit = fitPalm(source, target)!;
    expect(fit.a).toBeCloseTo(a);
    expect(fit.b).toBeCloseTo(b);
    expect(fit.error).toBeLessThan(1e-10);
    const fingertip = { x: -30, y: -90 };
    const transformed = {
      x: fit.a * fingertip.x - fit.b * fingertip.y + fit.tx,
      y: fit.b * fingertip.x + fit.a * fingertip.y + fit.ty,
    };
    expect(inversePoint(transformed, fit).x).toBeCloseTo(fingertip.x);
    expect(inversePoint(transformed, fit).y).toBeCloseTo(fingertip.y);
  });
  it('rejects degenerate anchors', () =>
    expect(fitPalm(Array(4).fill({ x: 0, y: 0 }) as Palm, source)).toBeNull());
  it('does not compare opposite hands, exercises or recording orientation', () => {
    const a = {
      exerciseId: 'finger-spread-close',
      selectedHand: 'Right',
      mirrored: false,
    };
    expect(compatible(a, { ...a })).toBe(true);
    expect(compatible(a, { ...a, selectedHand: 'Left' })).toBe(false);
    expect(compatible(a, { ...a, mirrored: true })).toBe(false);
    expect(compatible(a, { ...a, exerciseId: 'other' })).toBe(false);
    expect(
      compatible(
        { ...a, selectedHand: 'Unconfirmed' },
        { ...a, selectedHand: 'Unconfirmed' },
      ),
    ).toBe(false);
    const demo = {
      ...a,
      selectedHand: 'Unconfirmed',
      demonstration: true,
      comparisonGroup: 'same-hand-fixture',
    };
    expect(compatible(demo, demo)).toBe(true);
  });
});
const fixture = (values: number[]): EchoFrame[] =>
  values.map((spread, i) => ({
    tMs: i * 100,
    valid: true,
    spread,
    image: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
    world: [],
  }));
describe('measured repetition boundaries', () => {
  it('finds complete opening/peak/closing cycles', () => {
    const frames = fixture(
      Array.from(
        { length: 81 },
        (_, i) => 4 + (15 * (1 - Math.cos((i / 40) * Math.PI * 2))) / 2,
      ),
    );
    const reps = detectRepetitions(frames);
    expect(reps).toHaveLength(2);
    expect(reps[0].peakMs).toBeCloseTo(2000, -2);
    expect(reps[0].endMs).toBeLessThan(reps[1].peakMs);
  });
  it('does not invent a cycle from a held pose, small noise or an incomplete opening', () => {
    expect(detectRepetitions(fixture(Array(50).fill(7)))).toEqual([]);
    expect(
      detectRepetitions(
        fixture(Array.from({ length: 50 }, (_, i) => 7 + Math.sin(i) * 0.3)),
      ),
    ).toEqual([]);
    expect(
      detectRepetitions(fixture(Array.from({ length: 50 }, (_, i) => i * 0.4))),
    ).toEqual([]);
  });
  it('chooses tracking completeness rather than the widest spread', () => {
    expect(
      representativeRep([
        { ...rep, coverage: 0.9, peakSpread: 30 },
        { ...rep, coverage: 1, peakSpread: 9 },
      ]),
    ).toBe(1);
  });
  it('does not interpolate through lost tracking or long gaps', () => {
    const f = fixture([4, 8, 12]);
    expect(frameAtTime(f, 50)?.image).toHaveLength(21);
    expect(
      frameAtTime([{ ...f[0] }, { ...f[1], valid: false }], 50),
    ).toBeNull();
    expect(frameAtTime([f[0], { ...f[1], tMs: 1000 }], 400)).toBeNull();
    expect(frameAtTime(f, -1)).toBeNull();
  });
});
