import type { CoachSessionRecord, CoachSummary } from "../types/coach";
import { isComparable } from "./sessionEvaluator";
export function structuredSummary(session: CoachSessionRecord): CoachSummary {
  const differences = session.metrics.pairs
    .filter((p) => p.observedDegrees !== null)
    .sort(
      (a, b) =>
        Math.abs(b.targetDegrees - b.observedDegrees!) -
        Math.abs(a.targetDegrees - a.observedDegrees!),
    );
  const strongest = differences[0];
  return {
    exercise: session.exerciseId,
    completedRepetitions: session.completedRepetitions,
    plannedRepetitions: session.plannedRepetitions,
    trackingQuality: session.metrics.trackingQuality,
    targetAttainmentPercent: session.metrics.targetAttainmentPercent,
    status: session.status,
    strongestMeasuredDifference:
      strongest &&
      Math.abs(strongest.targetDegrees - strongest.observedDegrees!) >= 3
        ? {
            fingerPair: strongest.pair,
            observedDegrees: Number(strongest.observedDegrees!.toFixed(1)),
            targetDegrees: Number(strongest.targetDegrees.toFixed(1)),
          }
        : null,
  };
}
export function generateCoachSummary(session: CoachSessionRecord): string {
  const manual = session.repetitions.some((r) => r.source === "manual");
  const count = `${session.completedRepetitions} of ${session.plannedRepetitions} repetitions ${manual ? "recorded, including your manual confirmations" : "detected"}.`;
  if (
    session.status === "unassessable" ||
    session.metrics.targetAttainmentPercent === null
  )
    return `${count} We did not capture enough clear movement to compare with your personal opening goal. Your practice is saved with that limitation.${session.videoAvailable ? " You can review your recording below." : ""}`;
  const difference = structuredSummary(session).strongestMeasuredDifference;
  return `${count} Your measured opening reached ${Math.round(session.metrics.targetAttainmentPercent)}% of your configured opening goal.${difference ? ` Your ${difference.fingerPair.toLowerCase().replace("–", " and ")} fingers opened ${difference.observedDegrees < difference.targetDegrees ? "less" : "more"} than that goal.` : " The measured finger pairs were close to that goal."}${session.metrics.trackingQuality !== "good" ? " Some movement was not clearly tracked, so interpret these measurements with care." : ""} This describes this exercise, rather than a recovery score.${session.videoAvailable ? " You can review your recording below." : ""}`;
}
export function generateLongitudinalSummary(
  sessions: CoachSessionRecord[],
): string {
  const ordered = [...sessions].sort((a, b) =>
    a.completedAt.localeCompare(b.completedAt),
  );
  const newest = ordered.at(-1);
  if (!newest) return "No saved exercise sessions are available.";
  const comparable = ordered
    .filter((s) => s.id === newest.id || isComparable(newest, s))
    .slice(-6);
  const completed = comparable.reduce((n, s) => n + s.completedRepetitions, 0),
    planned = comparable.reduce((n, s) => n + s.plannedRepetitions, 0);
  const first = comparable[0],
    a = first.metrics.pairs[0],
    b = newest.metrics.pairs[0];
  return `Across ${comparable.length} comparable ${newest.hand.toLowerCase()}-hand ${newest.source === "demo" ? "sample " : ""}sessions, ${completed} of ${planned} planned repetitions were recorded.${a?.observedDegrees != null && b?.observedDegrees != null && comparable.length > 1 ? ` Measured index–middle peak separation changed from ${a.observedDegrees.toFixed(1)}° to ${b.observedDegrees.toFixed(1)}°.` : ""} These webcam estimates should be interpreted alongside clinical assessment; they do not establish recovery.`;
}
