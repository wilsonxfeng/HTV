import { expect, it } from 'vitest';
import { detectBodyRepetitions, type MovementSample } from './repetitionDetection';
import { phaseToTime, timeToPhase } from '../movement-echoes/geometry';

function movement(times: number[], values: number[]): MovementSample[] {
  const samples: MovementSample[] = [];
  for (let i = 0; i < times.length - 1; i++) for (let t = times[i]; t < times[i+1]; t += 50) {
    const progress = (t - times[i]) / (times[i+1] - times[i]);
    samples.push({ tMs: t, value: values[i] + progress * (values[i+1] - values[i]), valid: true });
  }
  return samples;
}
it('finds two reps with different speeds and a long rest, without including the rest in a cycle', () => {
  const samples = movement([0,400,1400,1900,2900,6000,6400,6900,7400,7900,8500], [90,90,145,145,90,90,90,145,145,90,90]);
  const reps = detectBodyRepetitions(samples);
  expect(reps).toHaveLength(2);
  expect(reps[0].endMs).toBeLessThan(3100);
  expect(reps[1].startMs).toBeGreaterThanOrEqual(6000);
  for (const rep of reps) {
    expect(phaseToTime(.5, rep)).toBe(rep.peakMs);
    expect(timeToPhase(rep.peakMs, rep)).toBeCloseTo(.5);
    expect(rep.phaseMap?.[0].phase).toBe(0);
    expect(rep.phaseMap?.at(-1)?.phase).toBe(1);
  }
});
it('keeps an overlay at the measured movement phase while the source pauses partway through a rep', () => {
  const [rep] = detectBodyRepetitions(movement([0,500,1500,3500,4500,5000,6000,6500], [90,90,120,120,150,150,90,90]));
  expect(rep).toBeTruthy();
  expect(timeToPhase(2000, rep)).toBeCloseTo(timeToPhase(3000, rep), 5);
  expect(phaseToTime(.4, rep)).toBeGreaterThan(3500);
  expect(phaseToTime(.75, rep)).toBeGreaterThan(rep.peakMs);
});

it('exposes a leading return-only segment for demo replay while keeping live counting complete-cycle only', () => {
  const frames = movement([0,1500,2500,3500,4500,5500,6500,7500], [150,150,90,90,150,150,90,90]);
  expect(detectBodyRepetitions(frames)).toHaveLength(1);
  const reps = detectBodyRepetitions(frames, 8, true);
  expect(reps).toHaveLength(2);
  expect(reps[0].partial).toBe('start');
  expect(reps[1].partial).toBeUndefined();
  expect(phaseToTime(0, reps[0])).toBe(reps[0].peakMs);
  expect(timeToPhase(0, reps[0])).toBe(.5);
  expect(phaseToTime(.75, reps[0])).toBeGreaterThan(reps[0].peakMs);
});
