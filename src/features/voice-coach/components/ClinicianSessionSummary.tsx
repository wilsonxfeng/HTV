import { useEffect, useState } from "react";
import { FileText, Play, Trash2 } from "lucide-react";
import type {
  CoachSessionRecord,
  CoachSessionRepository,
} from "../types/coach";
import { generateLongitudinalSummary } from "../engine/summaryGenerator";
import { recordingRepository } from "../recording/recordingRepository";
import { RecordingPlayback } from "./RecordingPlayback";
export function printSessionReport(session: CoachSessionRecord) {
  document.querySelector(".vc-report-print")?.remove();
  const surface = document.createElement("article");
  surface.className = "vc-report-print";
  const heading = document.createElement("h1");
  heading.textContent = "ReMotion exercise session report";
  surface.append(heading);
  const content = document.createElement("pre");
  content.textContent = reportText(session);
  surface.append(content);
  document.body.append(surface);
  // Some mobile browsers return from print before their preview closes.
  window.addEventListener("afterprint", () => surface.remove(), { once: true });
  window.print();
}
export function reportText(session: CoachSessionRecord): string {
  return `ReMotion — Finger Spread & Close\n${new Date(session.startedAt).toLocaleString()} · ${session.hand} hand${session.source === "demo" ? "\nILLUSTRATIVE SAMPLE — SYNTHETIC DATA" : ""}\nStatus: ${session.status}\nRepetitions: ${session.completedRepetitions} of ${session.plannedRepetitions}\nPersonal goal attainment: ${session.metrics.targetAttainmentPercent === null ? "Unassessable" : `${session.metrics.targetAttainmentPercent.toFixed(0)}%`}\nTracked movement: ${session.metrics.trackingPercent.toFixed(0)}%\n\n${session.metrics.pairs.map((p) => `${p.pair}: ${p.observedDegrees === null ? "Not measured" : `${p.observedDegrees.toFixed(1)}°`} / ${p.targetDegrees.toFixed(1)}° goal`).join("\n")}\n\n${session.coachSummary}\n${session.metrics.comparison ? `\nCompared with prior session ${session.metrics.comparison.previousSessionId}:\n${session.metrics.comparison.pairs.map((p) => `${p.pair}: ${p.changeDegrees >= 0 ? "+" : ""}${p.changeDegrees.toFixed(1)}°`).join("\n")}\n` : ""}\nWebcam landmark estimates; tracking and camera conditions affect measurements. This is not a recovery score or clinical assessment.\nReference: ${session.referenceVersion}\nAnalysis: ${session.analysisVersion}`;
}
export function CoachSessionCard({
  session,
  onReview,
}: {
  session: CoachSessionRecord;
  onReview?: (session: CoachSessionRecord) => void;
}) {
  return (
    <article className="vc-history-card">
      <div>
        <span className="vc-eyebrow">
          {session.source === "demo"
            ? "SAMPLE SESSION"
            : session.status.toUpperCase()}
        </span>
        <h3>Finger Spread & Close</h3>
        <p>
          {new Date(session.startedAt).toLocaleString()} · {session.hand} hand
        </p>
      </div>
      <div>
        <strong>
          {session.completedRepetitions}/{session.plannedRepetitions}
        </strong>
        <span>repetitions</span>
      </div>
      <button
        type="button"
        className="vc-secondary"
        onClick={() => onReview?.(session)}
      >
        <Play size={18} />
        Review session
      </button>
    </article>
  );
}
export function ClinicianSessionSummary({
  sessions,
  repository = recordingRepository,
  onDeleted,
}: {
  sessions: CoachSessionRecord[];
  repository?: CoachSessionRepository;
  onDeleted?: (id: string) => void;
}) {
  const [selected, setSelected] = useState<CoachSessionRecord | null>(null);
  const [video, setVideo] = useState<Blob | null>(null);
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setVideo(null);
    if (selected?.recordingId)
      void repository
        .getVideo(selected.recordingId)
        .then((blob) => {
          if (active) setVideo(blob ?? null);
        })
        .catch(() => {
          if (active) setNotice("Saved video could not be loaded.");
        });
    return () => {
      active = false;
    };
  }, [selected, repository]);
  return (
    <section className="vc-clinician">
      <header>
        <span className="vc-eyebrow">LOCAL DEMO · THIS BROWSER ONLY</span>
        <h2>Clinician preview</h2>
        <p>
          This local review screen has no authentication or remote patient
          access.
        </p>
      </header>
      <div className="vc-card">
        <h3>Recent comparable practice</h3>
        <p>{generateLongitudinalSummary(sessions)}</p>
      </div>
      {notice && (
        <p className="vc-warning" role="status">
          {notice}
        </p>
      )}
      <div className="vc-history-list">
        {sessions.map((session) => (
          <div key={session.id}>
            <CoachSessionCard session={session} onReview={setSelected} />
            <div className="vc-session-actions">
              <button type="button" onClick={() => printSessionReport(session)}>
                <FileText size={16} />
                Print report
              </button>
              {deleteId === session.id ? (
                <>
                  <span>Delete recording and session?</span>
                  <button
                    type="button"
                    onClick={() => {
                      void repository
                        .delete(session.id)
                        .then(() => {
                          onDeleted?.(session.id);
                          if (selected?.id === session.id) setSelected(null);
                          setDeleteId(null);
                          setNotice(
                            "Session and its local video deleted. This cannot be undone.",
                          );
                        })
                        .catch(() =>
                          setNotice("Deletion failed. Please retry."),
                        );
                    }}
                  >
                    Confirm delete
                  </button>
                  <button type="button" onClick={() => setDeleteId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setDeleteId(session.id)}>
                  <Trash2 size={16} />
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {!sessions.length && (
        <div className="vc-card">
          <p>No saved voice-coach sessions yet.</p>
        </div>
      )}
      {selected && (
        <div className="vc-card">
          <h3>
            {new Date(selected.startedAt).toLocaleDateString()} ·{" "}
            {selected.hand} hand
          </h3>
          <p>{selected.coachSummary}</p>
          <p className="vc-help">
            Tracked: {selected.metrics.trackingPercent.toFixed(0)}% ·{" "}
            {selected.metrics.assessedRepetitions} repetitions with enough
            measurements.
          </p>
          <ul>
            {selected.metrics.pairs.map((p) => (
              <li key={p.pair}>
                {p.pair}: {p.observedDegrees?.toFixed(1) ?? "—"}° /{" "}
                {p.targetDegrees.toFixed(1)}° goal
              </li>
            ))}
          </ul>
          <RecordingPlayback session={selected} video={video} />
        </div>
      )}
    </section>
  );
}
