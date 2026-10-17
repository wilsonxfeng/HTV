import { useState } from "react";
import { Check, Flower2, Save, Volume2 } from "lucide-react";
import type { CoachSessionRecord } from "../types/coach";
import { RecordingPlayback } from "./RecordingPlayback";
import { CoachInsightsPanel } from "./CoachInsightsPanel";
import { printSessionReport } from "./ClinicianSessionSummary";
export function CoachSessionResults({
  session,
  video,
  saved = false,
  saving = false,
  onSave,
  onFinish,
  onListen,
}: {
  session: CoachSessionRecord;
  video?: Blob | null;
  saved?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onFinish?: () => void;
  onListen?: (text: string) => void;
}) {
  const [seek, setSeek] = useState({ ms: 0, key: 0 });
  return (
    <div className="vc-results">
      <header>
        <span className="vc-eyebrow">A MOMENT FOR YOURSELF</span>
        <h2>
          {session.status === "unassessable"
            ? "Thank you for practicing."
            : "Beautiful work today!"}
        </h2>
        <p>Here’s how your hand moved.</p>
        {session.source === "demo" && (
          <span className="vc-sample-label">
            Illustrative sample · synthetic measurements
          </span>
        )}
      </header>
      <section className="vc-summary-card">
        <div>
          <strong>
            {session.completedRepetitions}
            <span> / {session.plannedRepetitions}</span>
          </strong>
          <p>repetitions recorded</p>
        </div>
        <div>
          <strong>
            {session.metrics.targetAttainmentPercent === null
              ? "—"
              : `${Math.round(session.metrics.targetAttainmentPercent)}%`}
          </strong>
          <p>
            {session.metrics.targetAttainmentPercent === null
              ? "Not enough clear movement to compare"
              : "of your personal opening goal"}
          </p>
        </div>
      </section>
      <section className="vc-card">
        <div className="vc-card-title">
          <h3>A little perspective</h3>
          {onListen && (
            <button
              type="button"
              className="vc-secondary"
              onClick={() => onListen(session.coachSummary)}
            >
              <Volume2 size={19} />
              Listen to summary
            </button>
          )}
        </div>
        <p className="vc-result-summary">{session.coachSummary}</p>
      </section>
      <RecordingPlayback
        session={session}
        video={video}
        seekMs={seek.ms}
        seekKey={seek.key}
      />
      {session.events.length > 0 && (
        <section className="vc-card">
          <h3>Moments to look at</h3>
          <p className="vc-help">
            Tap a moment to move the saved video to that part of the exercise.
          </p>
          <div className="vc-event-list">
            {session.events.map((event) => (
              <button
                type="button"
                key={event.id}
                onClick={() =>
                  setSeek((previous) => ({
                    ms: event.timestampMs,
                    key: previous.key + 1,
                  }))
                }
              >
                <span>
                  Repetition {event.repetition}
                  <strong>{event.description}</strong>
                </span>
                <span>{(event.timestampMs / 1000).toFixed(1)}s →</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <CoachInsightsPanel session={session} />
      <div className="vc-result-actions">
        {onSave && (
          <button
            type="button"
            className="vc-secondary"
            disabled={saving}
            onClick={onSave}
          >
            {saved ? <Check size={20} /> : <Save size={20} />}{" "}
            {saving
              ? "Saving…"
              : saved
                ? "Saved to my progress"
                : "Save to my progress"}
          </button>
        )}
        <button
          type="button"
          className="vc-secondary"
          onClick={() => printSessionReport(session)}
        >
          Print session report
        </button>
        {onFinish && (
          <button
            type="button"
            className="vc-primary"
            disabled={!saved || saving}
            onClick={onFinish}
          >
            <Flower2 size={20} />
            {session.status === "completed" && session.source !== "demo"
              ? "Finish and visit my garden"
              : "Finish review"}
          </button>
        )}
      </div>
    </div>
  );
}
