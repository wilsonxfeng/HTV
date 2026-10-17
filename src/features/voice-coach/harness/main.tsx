import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { VoiceCoachExperience } from "../components/VoiceCoachExperience";
import { CoachSessionResults } from "../components/CoachSessionResults";
import { ClinicianSessionSummary } from "../components/ClinicianSessionSummary";
import { useExistingMotionAdapter } from "../adapters/motionAdapter";
import { recordingRepository } from "../recording/recordingRepository";
import { sampleCoachSession } from "../demo/sampleCoachSession";
import type { CoachSessionRecord } from "../types/coach";
import "../voice-coach.css";
function Harness() {
  const motion = useExistingMotionAdapter();
  const [view, setView] = useState<"practice" | "sample" | "clinician">(
    "practice",
  );
  const [sessions, setSessions] = useState<CoachSessionRecord[]>([]);
  const [sample] = useState(sampleCoachSession);
  const [rewards, setRewards] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  useEffect(() => window.scrollTo(0, 0), [view]);
  const load = async () => {
    try {
      setSessions(await recordingRepository.list());
    } catch {
      setNotice(
        "Local storage unavailable. New exercise results can still be viewed and exported.",
      );
    }
  };
  return (
    <>
      <nav className="vc-harness-nav" aria-label="Isolated feature preview">
        <strong>ReMotion Coach · isolated preview</strong>
        <button type="button" onClick={() => setView("practice")}>
          Practice
        </button>
        <button type="button" onClick={() => setView("sample")}>
          Sample results
        </button>
        <button
          type="button"
          onClick={() => {
            void load();
            setView("clinician");
          }}
        >
          Clinician preview
        </button>
        <span className="vc-harness-notice">
          {notice || "Host app unchanged · no garden implemented here"}
          {rewards.size
            ? ` · ${rewards.size} unique completion event(s) received`
            : ""}
        </span>
      </nav>
      {view === "practice" && (
        <VoiceCoachExperience
          motionAdapter={motion}
          onSessionComplete={() => load()}
          onGardenReward={(event) => {
            setRewards((old) => new Set([...old, event.id]));
          }}
          onExit={() => {
            void load();
            setView("clinician");
          }}
        />
      )}{" "}
      {view === "sample" && (
        <div className="vc-experience">
          <CoachSessionResults session={sample} />
        </div>
      )}
      {view === "clinician" && (
        <div className="vc-experience">
          <ClinicianSessionSummary
            sessions={sessions}
            onDeleted={(id) =>
              setSessions((old) => old.filter((session) => session.id !== id))
            }
          />
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("voice-coach-harness")!).render(<Harness />);
