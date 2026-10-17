import { FINGER_PAIRS, MAX_FRAME_GAP, pairAngles, validFrame } from './geometry';
import type { Deviation, HandFrame, MotionSession, PairMetric, SessionAnalysis } from './types';

const MIN_TARGET_CHANGE = 2;
const MIN_DEVIATION = 3;
const HOLD_START = 0.45;
const HOLD_END = 0.65;

interface ObservedHold {
  repetition: number;
  duration: number;
  sums: number[];
  samples: { t: number; angles: number[] }[];
}

/** Descriptive geometry only: no confidence interval, clinical score, or accuracy is
 * inferred. Camera landmark depth and all resulting angles remain model estimates.
 * A hold needs >=50% observed temporal coverage before contributing measurements.
 */
export function analyzeSession(session: MotionSession): SessionAnalysis {
  const result: SessionAnalysis = { pairs: [], deviations: [], targetAttainment: null, trackingQuality: 0, validFrames: 0, repetitions: 0 };
  const duration = Number.isFinite(session.duration) ? Math.max(0, session.duration) : 0;
  const cycle = Number.isFinite(session.cycleDuration) && session.cycleDuration > 0 ? session.cycleDuration : 8;
  const frames = session.frames.filter(f => Number.isFinite(f.t) && f.t >= 0 && f.t <= duration).sort((a, b) => a.t - b.t);
  result.validFrames = frames.filter(validFrame).length;
  if (!duration || frames.length < 2) return result;
  const neutral = pairAngles(session.calibration.neutral);
  const target = pairAngles(session.calibration.target);
  const holds = new Map<number, ObservedHold>();
  let observedTime = 0;
  let previous: HandFrame | undefined;

  for (const frame of frames) {
    const a = previous;
    previous = frame;
    if (!validFrame(a) || !validFrame(frame)) continue;
    const dt = frame.t - a.t;
    if (dt <= 0 || dt > MAX_FRAME_GAP) continue;
    observedTime += dt;
    if (!neutral.length || !target.length) continue;
    const aAngles = pairAngles(a.landmarks);
    const bAngles = pairAngles(frame.landmarks);
    const firstRep = Math.floor(a.t / cycle);
    const lastRep = Math.floor(frame.t / cycle);
    for (let rep = firstRep; rep <= lastRep; rep++) {
      const start = Math.max(a.t, (rep + HOLD_START) * cycle);
      const end = Math.min(frame.t, (rep + HOLD_END) * cycle);
      if (end <= start) continue;
      const hold = holds.get(rep) ?? { repetition: rep + 1, duration: 0, sums: [0, 0, 0, 0], samples: [] };
      const midpoint = (start + end) / 2;
      const fraction = (midpoint - a.t) / dt;
      const angles = aAngles.map((angle, i) => angle + (bAngles[i] - angle) * fraction);
      hold.duration += end - start;
      angles.forEach((angle, i) => { hold.sums[i] += angle * (end - start); });
      // Event navigation lands on a real observation within this hold.
      const observed = frame.t <= (rep + HOLD_END) * cycle ? frame : a;
      hold.samples.push({ t: observed.t, angles: observed === frame ? bAngles : aAngles });
      holds.set(rep, hold);
    }
  }
  result.trackingQuality = Math.min(100, Math.max(0, observedTime / duration * 100));
  const sufficientHolds = [...holds.values()].filter(h => h.duration + 1e-8 >= cycle * (HOLD_END - HOLD_START) * 0.5);
  result.repetitions = sufficientHolds.length;
  if (!sufficientHolds.length) return result;

  const measuredDuration = sufficientHolds.reduce((sum, hold) => sum + hold.duration, 0);
  result.pairs = FINGER_PAIRS.map((pair, i): PairMetric => {
    const achieved = sufficientHolds.reduce((sum, hold) => sum + hold.sums[i], 0) / measuredDuration;
    const targetChange = target[i] - neutral[i];
    return {
      pair: pair.name, indices: pair.indices, neutral: neutral[i], target: target[i], achieved,
      attainment: targetChange >= MIN_TARGET_CHANGE ? Math.min(100, Math.max(0, (achieved - neutral[i]) / targetChange * 100)) : null,
    };
  });
  const eligible = result.pairs.flatMap(pair => pair.attainment === null ? [] : [pair.attainment]);
  result.targetAttainment = eligible.length ? eligible.reduce((sum, n) => sum + n, 0) / eligible.length : null;

  const sourceLabel = session.calibration.source === 'demo' ? 'sample reference' : session.calibration.source === 'clinician' ? 'configured reference' : session.calibration.source === 'exemplar' ? 'video exemplar' : 'personal reference';
  for (const hold of sufficientHolds) {
    FINGER_PAIRS.forEach((pair, i) => {
      if (target[i] - neutral[i] < MIN_TARGET_CHANGE) return;
      const meanActual = hold.sums[i] / hold.duration;
      if (Math.abs(target[i] - meanActual) < MIN_DEVIATION) return;
      const sample = hold.samples.reduce((best, item) =>
        Math.abs(item.angles[i] - meanActual) < Math.abs(best.angles[i] - meanActual) ? item : best);
      const actual = sample.angles[i];
      const difference = target[i] - actual;
      const event: Deviation = {
        id: `${session.id}-rep${hold.repetition}-pair${i}`, t: sample.t,
        repetition: hold.repetition, pair: pair.name, indices: pair.indices,
        difference, actual, target: target[i],
        message: `${pair.name} separation is ${Math.abs(difference).toFixed(1)}° ${difference > 0 ? 'below' : 'above'} the ${sourceLabel} during repetition ${hold.repetition}.`,
      };
      result.deviations.push(event);
    });
  }
  result.deviations.sort((a, b) => a.t - b.t || Math.abs(b.difference) - Math.abs(a.difference));
  return result;
}
