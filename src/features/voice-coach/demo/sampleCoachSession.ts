import { createDemoSession } from "../../../lib/demo";
import {
  ANALYSIS_VERSION,
  evaluateCompletedSession,
  referenceVersion,
} from "../engine/sessionEvaluator";
import { generateCoachSummary } from "../engine/summaryGenerator";
import type { CoachSessionRecord, RepetitionMarker } from "../types/coach";
export function sampleCoachSession(): CoachSessionRecord {
  const motion = createDemoSession();
  const repetitions: RepetitionMarker[] = [0, 1, 2].map((index) => ({
    id: `sample-rep-${index + 1}`,
    startMs: index * 8000,
    peakMs: index * 8000 + 4000,
    endMs: (index + 1) * 8000,
    source: "vision",
    peakSpread: null,
  }));
  const evaluated = evaluateCompletedSession(
    motion.frames,
    motion.calibration,
    repetitions,
    24000,
  );
  const result: CoachSessionRecord = {
    id: motion.id,
    exerciseId: "finger_spread_close",
    hand: motion.hand,
    startedAt: motion.createdAt,
    completedAt: motion.createdAt,
    plannedRepetitions: 3,
    completedRepetitions: 3,
    status: "completed",
    metrics: evaluated.metrics,
    events: evaluated.events,
    videoAvailable: false,
    repetitions,
    trackingMarkers: [{ timestampMs: 0, tracking: true }],
    referenceVersion: referenceVersion(motion.calibration),
    analysisVersion: ANALYSIS_VERSION,
    coachSummary: "",
    motionSession: motion,
    source: "demo",
  };
  result.coachSummary = generateCoachSummary(result);
  return result;
}
