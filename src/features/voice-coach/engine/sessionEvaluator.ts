import {
  FINGER_PAIRS,
  pairAngles,
  validFrame,
  MAX_FRAME_GAP,
} from "../../../lib/geometry";
import type {
  Calibration,
  CoachSessionRecord,
  EvaluationEvent,
  ExerciseMetrics,
  HandFrame,
  RepetitionMarker,
} from "../types/coach";
export const ANALYSIS_VERSION = "voice-spread-peaks-v1";
export function referenceVersion(calibration: Calibration | null): string {
  if (!calibration) return "unavailable";
  return `${calibration.source}:${calibration.hand}:${pairAngles(
    calibration.neutral,
  )
    .map((n) => n.toFixed(1))
    .join(",")}:${pairAngles(calibration.target)
    .map((n) => n.toFixed(1))
    .join(",")}`;
}
export function isComparable(
  a: CoachSessionRecord,
  b: CoachSessionRecord,
): boolean {
  return (
    a.id !== b.id &&
    a.source === b.source &&
    a.exerciseId === b.exerciseId &&
    a.hand === b.hand &&
    a.referenceVersion === b.referenceVersion &&
    a.analysisVersion === b.analysisVersion &&
    a.metrics.assessedRepetitions > 0 &&
    b.metrics.assessedRepetitions > 0
  );
}
export function evaluateCompletedSession(
  frames: HandFrame[],
  calibration: Calibration | null,
  markers: RepetitionMarker[],
  durationMs: number,
): { metrics: ExerciseMetrics; events: EvaluationEvent[] } {
  const ordered = [...frames]
    .filter((f) => Number.isFinite(f.t) && f.t >= 0 && f.t <= durationMs / 1000)
    .sort((a, b) => a.t - b.t);
  let trackedSeconds = 0;
  for (let i = 1; i < ordered.length; i++)
    if (
      validFrame(ordered[i - 1]) &&
      validFrame(ordered[i]) &&
      ordered[i].t - ordered[i - 1].t <= MAX_FRAME_GAP
    )
      trackedSeconds += ordered[i].t - ordered[i - 1].t;
  const trackingPercent =
    durationMs > 0
      ? Math.min(100, (trackedSeconds / (durationMs / 1000)) * 100)
      : 0;
  const metrics: ExerciseMetrics = {
    pairs: [],
    targetAttainmentPercent: null,
    trackingPercent,
    trackingQuality:
      trackingPercent >= 80
        ? "good"
        : trackingPercent >= 50
          ? "limited"
          : "insufficient",
    consistencyDegrees: null,
    assessedRepetitions: 0,
    comparison: null,
  };
  const events: EvaluationEvent[] = [];
  if (!calibration) return { metrics, events };
  const neutral = pairAngles(calibration.neutral),
    target = pairAngles(calibration.target);
  if (neutral.length !== 4 || target.length !== 4) return { metrics, events };
  const peaks: { values: number[]; time: number; rep: number }[] = [];
  markers.forEach((marker, repetition) => {
    const part = ordered.filter(
      (f) => f.t * 1000 >= marker.startMs && f.t * 1000 <= marker.endMs,
    );
    const valid = part.filter(validFrame);
    let coverage = 0;
    for (let i = 1; i < part.length; i++)
      if (
        validFrame(part[i - 1]) &&
        validFrame(part[i]) &&
        part[i].t - part[i - 1].t <= MAX_FRAME_GAP
      )
        coverage += part[i].t - part[i - 1].t;
    if (
      valid.length < 8 ||
      marker.endMs <= marker.startMs ||
      coverage / ((marker.endMs - marker.startMs) / 1000) < 0.5
    )
      return;
    // Smooth a peak over nearby observed frames; never synthesize across gaps.
    const candidates = valid.map((frame) => {
      const nearby = valid.filter((f) => Math.abs(f.t - frame.t) <= 0.12);
      const sums = nearby.map((f) => pairAngles(f.landmarks));
      const values = [0, 1, 2, 3].map(
        (i) => sums.reduce((sum, angles) => sum + angles[i], 0) / sums.length,
      );
      return {
        values,
        time: frame.t * 1000,
        spread: values.slice(1).reduce((a, b) => a + b, 0) / 3,
      };
    });
    const peak = candidates.reduce((a, b) => (b.spread > a.spread ? b : a));
    peaks.push({ values: peak.values, time: peak.time, rep: repetition + 1 });
    FINGER_PAIRS.slice(1).forEach((pair, i) => {
      const observed = peak.values[i + 1];
      if (
        target[i + 1] - neutral[i + 1] < 2 ||
        Math.abs(target[i + 1] - observed) < 3
      )
        return;
      events.push({
        id: `${marker.id}-${i}`,
        timestampMs: peak.time,
        repetition: repetition + 1,
        metric: pair.name,
        observedDegrees: observed,
        targetDegrees: target[i + 1],
        severity: "notice",
        description: `${pair.name}: ${Math.abs(target[i + 1] - observed).toFixed(1)}° ${observed < target[i + 1] ? "below" : "above"} your configured opening goal.`,
      });
    });
  });
  metrics.assessedRepetitions = peaks.length;
  metrics.pairs = FINGER_PAIRS.slice(1).map((pair, i) => {
    const observedDegrees = peaks.length
      ? peaks.reduce((sum, peak) => sum + peak.values[i + 1], 0) / peaks.length
      : null;
    return {
      pair: pair.name,
      observedDegrees,
      targetDegrees: target[i + 1],
      neutralDegrees: neutral[i + 1],
      attainmentPercent:
        observedDegrees !== null && target[i + 1] - neutral[i + 1] >= 2
          ? Math.min(
              100,
              Math.max(
                0,
                ((observedDegrees - neutral[i + 1]) /
                  (target[i + 1] - neutral[i + 1])) *
                  100,
              ),
            )
          : null,
    };
  });
  const attainments = metrics.pairs.flatMap((p) =>
    p.attainmentPercent === null ? [] : [p.attainmentPercent],
  );
  metrics.targetAttainmentPercent = attainments.length
    ? attainments.reduce((a, b) => a + b, 0) / attainments.length
    : null;
  if (peaks.length >= 2) {
    const values = peaks.map(
        (p) => p.values.slice(1).reduce((a, b) => a + b, 0) / 3,
      ),
      mean = values.reduce((a, b) => a + b, 0) / values.length;
    metrics.consistencyDegrees = Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length,
    );
  }
  return { metrics, events };
}
export function addSessionComparison(
  session: CoachSessionRecord,
  previous: CoachSessionRecord[],
): CoachSessionRecord {
  const comparable = [...previous]
    .filter(
      (s) => isComparable(session, s) && s.completedAt < session.completedAt,
    )
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  if (!comparable) return session;
  return {
    ...session,
    metrics: {
      ...session.metrics,
      comparison: {
        previousSessionId: comparable.id,
        targetAttainmentChange:
          session.metrics.targetAttainmentPercent === null ||
          comparable.metrics.targetAttainmentPercent === null
            ? null
            : session.metrics.targetAttainmentPercent -
              comparable.metrics.targetAttainmentPercent,
        pairs: session.metrics.pairs.flatMap((p) => {
          const prior = comparable.metrics.pairs.find((q) => q.pair === p.pair);
          return p.observedDegrees !== null && prior?.observedDegrees != null
            ? [
                {
                  pair: p.pair,
                  changeDegrees: p.observedDegrees - prior.observedDegrees,
                },
              ]
            : [];
        }),
      },
    },
  };
}
