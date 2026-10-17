import { describe, expect, it } from 'vitest';
import { analyzeSession } from './analysis';
import { createDemoSession, makeDemoHand } from './demo';
import { pairAngles } from './geometry';
import type { MotionSession } from './types';

function measuredSession(amount = 1): MotionSession {
  const session = createDemoSession();
  return {
    ...session, id: 'measured-test', source: 'camera', duration: 8,
    calibration: { ...session.calibration, source: 'personal' },
    frames: Array.from({ length: 81 }, (_, i) => ({ t: i / 10, landmarks: makeDemoHand(amount), tracking: true, confidence: 0.98 })),
  };
}

describe('observed session analysis', () => {
  it('leaves measurements undefined when no valid recording or hold exists', () => {
    const empty = analyzeSession({ ...measuredSession(), frames: [] });
    expect(empty).toEqual({ pairs: [], deviations: [], targetAttainment: null, trackingQuality: 0, validFrames: 0, repetitions: 0 });
    const missing = measuredSession();
    missing.frames.forEach(f => { f.tracking = false; });
    expect(analyzeSession(missing)).toEqual(empty);
    const short = measuredSession(); short.duration = 1;
    const shortAnalysis = analyzeSession(short);
    expect(shortAnalysis.targetAttainment).toBeNull();
    expect(shortAnalysis.repetitions).toBe(0);
    expect(shortAnalysis.trackingQuality).toBeCloseTo(100);
  });

  it('measures attainment against personal change from neutral, never absolute angle', () => {
    const session = measuredSession(0.65);
    session.calibration.neutral = makeDemoHand(0.2);
    const actual = pairAngles(makeDemoHand(0.65));
    const neutral = pairAngles(session.calibration.neutral);
    const target = pairAngles(session.calibration.target);
    const result = analyzeSession(session);
    expect(result.repetitions).toBe(1);
    result.pairs.forEach((pair, i) => {
      expect(pair.achieved).toBeCloseTo(actual[i], 8);
      expect(pair.attainment).toBeCloseTo((actual[i] - neutral[i]) / (target[i] - neutral[i]) * 100, 7);
    });
    expect(result.targetAttainment).toBeGreaterThan(40);
    expect(result.targetAttainment).toBeLessThan(80);
  });

  it('does not divide by an unchanged personal target or imply failure', () => {
    const session = measuredSession(0);
    session.calibration.target = session.calibration.neutral;
    const result = analyzeSession(session);
    expect(result.pairs).toHaveLength(4);
    expect(result.pairs.every(pair => pair.attainment === null)).toBe(true);
    expect(result.targetAttainment).toBeNull();
    expect(result.deviations).toEqual([]);
  });

  it('uses elapsed tracking coverage instead of the fraction of available frames', () => {
    const session = measuredSession();
    session.frames = [session.frames[0], session.frames[1], session.frames[2], session.frames[79], session.frames[80]];
    const result = analyzeSession(session);
    expect(result.validFrames).toBe(5);
    expect(result.trackingQuality).toBeCloseTo(3.75, 8);
    expect(result.targetAttainment).toBeNull();
    expect(result.pairs).toEqual([]);
  });

  it('excludes a hold with less than half its duration tracked', () => {
    const session = measuredSession();
    session.frames.forEach(frame => { if (frame.t > 3.8 && frame.t <= 5.2) frame.tracking = false; });
    const result = analyzeSession(session);
    expect(result.repetitions).toBe(0);
    expect(result.targetAttainment).toBeNull();
    expect(result.trackingQuality).toBeLessThan(90);
  });

  it('has no deviation for a match and caps overshoot attainment at 100%', () => {
    const matched = analyzeSession(measuredSession());
    expect(matched.targetAttainment).toBeCloseTo(100, 7);
    expect(matched.deviations).toEqual([]);
    const exceeded = measuredSession(1);
    exceeded.calibration.target = makeDemoHand(0.5);
    const result = analyzeSession(exceeded);
    expect(result.targetAttainment).toBe(100);
    expect(result.deviations.every(event => event.difference < 0 && event.message.includes('above'))).toBe(true);
  });

  it('does not mutate time ordering in the persisted recording', () => {
    const session = measuredSession();
    session.frames.reverse();
    analyzeSession(session);
    expect(session.frames[0].t).toBe(8);
  });
});

describe('explicit synthetic walkthrough', () => {
  it('provides 24 seconds, three repetitions, and anatomically indexed 3D observations', () => {
    const session = createDemoSession();
    expect(session.source).toBe('demo');
    expect(session.calibration.source).toBe('demo');
    expect(session.id.startsWith('demo-')).toBe(true);
    expect(session.duration).toBe(24);
    expect(session.frames).toHaveLength(721);
    expect(session.frames.at(-1)?.t).toBe(24);
    expect(session.frames.every(frame => frame.landmarks.length === 21)).toBe(true);
    const analysis = analyzeSession(session);
    expect(analysis.repetitions).toBe(3);
    expect(analysis.trackingQuality).toBeCloseTo(100, 8);
    expect(analysis.targetAttainment).toBeGreaterThan(65);
    expect(analysis.targetAttainment).toBeLessThan(90);
    expect(new Set(analysis.deviations.map(event => event.repetition))).toEqual(new Set([1, 2, 3]));
    expect(analysis.deviations.some(event => event.pair === 'Middle–Ring')).toBe(true);
    expect(analysis.deviations.every(event => event.message.includes('sample reference'))).toBe(true);
  });
});
