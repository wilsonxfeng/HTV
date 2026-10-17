import { Check, Square } from "lucide-react";
import type {
  GuidedSessionController,
  GuidedSnapshot,
} from "../engine/sessionController";
export function IndependentPractice({
  controller,
  snapshot,
}: {
  controller: GuidedSessionController;
  snapshot: GuidedSnapshot;
}) {
  return (
    <section className="vc-card vc-independent">
      <span className="vc-eyebrow">YOUR TURN</span>
      <h2>
        {snapshot.starting
          ? "Preparing your recording…"
          : `${snapshot.state.plannedRepetitions} gentle repetitions.`}
      </h2>
      <p>Spread and close at your own comfortable pace.</p>
      <div className="vc-rep-circles">
        {Array.from({ length: snapshot.state.plannedRepetitions }, (_, i) => (
          <span
            className={
              snapshot.state.completedRepetitions > i ? "vc-rep-done" : ""
            }
            key={i}
          >
            {snapshot.state.completedRepetitions > i ? (
              <Check size={24} />
            ) : (
              i + 1
            )}
          </span>
        ))}
      </div>
      <p>
        {snapshot.state.completedRepetitions} of{" "}
        {snapshot.state.plannedRepetitions} recorded ·{" "}
        {(snapshot.elapsedMs / 1000).toFixed(0)} seconds
      </p>
      <button
        type="button"
        className="vc-secondary"
        disabled={snapshot.starting}
        onClick={() => controller.manualRepetition()}
      >
        I completed one repetition
      </button>
      <p className="vc-help">
        Use this if the counter misses your movement. Manual confirmations are
        labeled in your results.
      </p>
      <button
        type="button"
        className="vc-stop"
        onClick={() => void controller.stop()}
      >
        <Square size={18} />
        Stop and keep this recording
      </button>
    </section>
  );
}
