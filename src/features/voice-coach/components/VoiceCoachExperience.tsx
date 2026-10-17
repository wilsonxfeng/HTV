import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  Flower2,
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import type {
  GuidedSessionController,
  GuidedSnapshot,
} from "../engine/sessionController";
import type { VoiceCoachExperienceProps } from "../types/coach";
import { useGuidedSession } from "../hooks/useGuidedSession";
import { useVoiceCoach } from "../hooks/useVoiceCoach";
import { ElevenLabsProvider } from "../elevenlabs/ElevenLabsProvider";
import { VoiceCoachPanel } from "./VoiceCoachPanel";
import { GuidedPracticeFlow } from "./GuidedPracticeFlow";
import { IndependentPractice } from "./IndependentPractice";
import { CoachSessionResults } from "./CoachSessionResults";
import "../voice-coach.css";
export function VoiceCoachExperience(props: VoiceCoachExperienceProps) {
  const session = useGuidedSession(props);
  return (
    <ElevenLabsProvider controller={session.controller}>
      <ExperienceBody
        {...props}
        controller={session.controller}
        snapshot={session}
      />
    </ElevenLabsProvider>
  );
}
function ExperienceBody({
  controller,
  snapshot,
  ...props
}: VoiceCoachExperienceProps & {
  controller: GuidedSessionController;
  snapshot: GuidedSnapshot;
}) {
  const voice = useVoiceCoach(controller, snapshot, props.voiceConfiguration);
  const leaving = useRef(false);
  const phase = snapshot.state.phase;
  const live = [
    "calibration",
    "guided_demo",
    "guided_practice",
    "independent_intro",
    "independent_recording",
    "paused",
  ].includes(phase);
  useEffect(() => {
    if (phase === "complete") voice.disconnect();
  }, [phase]);
  const next = () => controller.next();
  return (
    <div className="vc-experience">
      <header className="vc-header">
        <button
          type="button"
          className="vc-back"
          disabled={snapshot.saving || phase === "analyzing"}
          onClick={async () => {
            if (leaving.current) return;
            leaving.current = true;
            voice.disconnect();
            const current = controller.getSnapshot();
            if (
              current.state.phase === "independent_recording" ||
              (current.state.phase === "paused" &&
                current.state.resumePhase === "independent_recording") ||
              current.starting
            )
              await controller.stop();
            if (props.onExit) {
              controller.dispose();
              props.onExit();
            } else controller.reset();
            leaving.current = false;
          }}
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <div>
          <span className="vc-eyebrow">YOUR DAILY MOMENT OF MOVEMENT</span>
          <h1>Finger Spread & Close</h1>
        </div>
        <span className="vc-header-flower">
          <Flower2 size={25} />
        </span>
      </header>
      <VoiceCoachPanel caption={snapshot.caption} voice={voice} />
      {snapshot.notice && (
        <p className="vc-notice" role="status">
          {snapshot.notice}
        </p>
      )}
      {phase === "idle" && (
        <section className="vc-card vc-welcome">
          <span className="vc-eyebrow">ONE SMALL STEP, AT YOUR PACE</span>
          <h2>Let’s make a little room for movement.</h2>
          <p>
            First we’ll find your comfortable range and practice together. Then
            you can try 3–5 repetitions on your own.
          </p>
          <p className="vc-help">
            Follow your prescribed plan. Stop if uncomfortable. This demo
            supports practice and review, and does not provide a clinical
            assessment.
          </p>
          <button
            type="button"
            className="vc-primary"
            onClick={() => controller.begin()}
          >
            Begin my practice <Play size={20} />
          </button>
        </section>
      )}
      {phase === "permissions" && (
        <section className="vc-card">
          <h2>Your camera, with your permission.</h2>
          <p>
            Your camera is used for hand tracking on this device. Microphone
            access is requested only when you choose Connect voice coach.
            Connected voice is processed externally by ElevenLabs.
          </p>
          <p>
            Saving a silent webcam video is a separate choice before independent
            practice. It stays in this browser unless you export it.
          </p>
          <button
            type="button"
            className="vc-primary"
            disabled={snapshot.cameraBusy}
            onClick={() => void controller.enableCamera()}
          >
            <Camera size={20} />
            {snapshot.cameraBusy ? "Preparing camera…" : "Enable camera"}
          </button>
          {snapshot.cameraError && (
            <p className="vc-warning" role="alert">
              {snapshot.cameraError}
            </p>
          )}
          <p className="vc-help">
            If the browser blocks access, allow Camera in its site permissions
            and retry.
          </p>
        </section>
      )}
      {live && (
        <div className="vc-sticky-controls">
          {phase === "paused" ? (
            <button
              type="button"
              className="vc-primary"
              onClick={() => controller.resume()}
            >
              <Play size={20} />
              Resume
            </button>
          ) : (
            <button
              type="button"
              className="vc-secondary"
              onClick={() => controller.pause()}
              disabled={snapshot.starting}
            >
              <Pause size={20} />
              Pause
            </button>
          )}
          <button
            type="button"
            className="vc-stop"
            onClick={() => {
              voice.disconnect();
              void controller.stop();
            }}
          >
            <Square size={20} />
            Stop
          </button>
        </div>
      )}
      <div className={`vc-practice-layout ${!live ? "vc-camera-hidden" : ""}`}>
        <section className="vc-camera-card" aria-label="Live exercise camera">
          <div className="vc-camera-heading">
            <span>
              <i
                className={
                  phase === "independent_recording" ? "vc-record-dot" : ""
                }
              />
              {phase === "independent_recording"
                ? "Recording movement"
                : "Your camera"}
            </span>
            <span>
              {snapshot.state.tracking
                ? "Hand detected"
                : "Position one hand in view"}
            </span>
          </div>
          <div className="vc-camera-view">
            <video
              ref={props.motionAdapter.videoRef}
              muted
              playsInline
              aria-label="Live mirrored webcam view"
            />
            <canvas ref={props.motionAdapter.overlayRef} aria-hidden="true" />
            {!snapshot.state.tracking && (
              <span className="vc-camera-guide">
                Palm toward the camera.
                <br />
                Keep your whole hand in view.
              </span>
            )}
            {snapshot.countdown !== null && (
              <div className="vc-countdown" role="status">
                <strong>{snapshot.countdown}</strong>
                <p>Your turn begins in a moment.</p>
              </div>
            )}
          </div>
          <p className="vc-camera-foot">
            {snapshot.videoOptIn && phase === "independent_recording"
              ? "Video saving enabled · camera audio excluded"
              : "Vision processed on your device"}
          </p>
        </section>
        <div className="vc-practice-sidebar">
          {phase === "calibration" && (
            <section className="vc-card">
              <h2>Find your comfortable range.</h2>
              <p>
                Select the physical hand you’re showing. The preview is
                mirrored.
              </p>
              <div className="vc-hand-choice">
                {(["Left", "Right"] as const).map((hand) => (
                  <button
                    type="button"
                    key={hand}
                    className={
                      snapshot.hand === hand ? "vc-primary" : "vc-secondary"
                    }
                    disabled={snapshot.neutralComplete || !!snapshot.capturing}
                    onClick={() => controller.setHand(hand)}
                  >
                    {hand} hand {snapshot.hand === hand && <Check size={16} />}
                  </button>
                ))}
              </div>
              <p>
                {snapshot.neutralComplete
                  ? "Now spread to a comfortable goal. Hold still, then capture."
                  : "Begin with fingers gently together and relatively straight. Hold still, then capture."}
              </p>
              <button
                type="button"
                className="vc-primary vc-full"
                disabled={!snapshot.state.tracking || !!snapshot.capturing}
                onClick={() =>
                  controller.capturePose(
                    snapshot.neutralComplete ? "target" : "neutral",
                  )
                }
              >
                {snapshot.capturing
                  ? `Hold steady… ${Math.round(snapshot.captureProgress * 100)}%`
                  : snapshot.neutralComplete
                    ? "Capture comfortable spread"
                    : "Capture fingers together"}
              </button>
              {snapshot.state.calibrated && (
                <button
                  type="button"
                  className="vc-primary vc-full"
                  onClick={next}
                >
                  My reference is ready →
                </button>
              )}
              <details className="vc-limitations">
                <summary>Cannot complete calibration?</summary>
                <p>
                  A clinician-provided target is needed for a personalized
                  comparison. You may continue with manually confirmed
                  repetitions, with limited results and no opening-goal score.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={snapshot.state.referenceLimitationsAcknowledged}
                    onChange={(e) =>
                      controller.acknowledgeReference(e.target.checked)
                    }
                  />
                  I understand the reference limitations.
                </label>
                <button
                  type="button"
                  className="vc-secondary"
                  disabled={!snapshot.state.referenceLimitationsAcknowledged}
                  onClick={next}
                >
                  Continue with limitations
                </button>
              </details>
            </section>
          )}
          {(phase === "guided_demo" || phase === "guided_practice") && (
            <>
              <GuidedPracticeFlow
                elapsedMs={snapshot.guidedElapsedMs}
                calibration={controller.getCalibration()}
                demo={phase === "guided_demo"}
              />
              <button
                type="button"
                className="vc-primary vc-full"
                onClick={next}
              >
                {phase === "guided_demo"
                  ? "Let’s practice together"
                  : "Continue to my turn"}
                <Play size={18} />
              </button>
            </>
          )}
          {phase === "independent_intro" && (
            <section className="vc-card">
              <span className="vc-eyebrow">YOUR TURN</span>
              <h2>A few gentle repetitions, on your own.</h2>
              <label className="vc-select-label" htmlFor="vc-repetition-plan">
                Your prescribed plan
              </label>
              <select
                id="vc-repetition-plan"
                value={snapshot.state.plannedRepetitions}
                disabled={snapshot.countdown !== null}
                onChange={(e) =>
                  controller.setPlan(Number(e.target.value) as 3 | 4 | 5)
                }
              >
                <option value="3">3 repetitions</option>
                <option value="4">4 repetitions</option>
                <option value="5">5 repetitions</option>
              </select>
              <label className="vc-checkbox">
                <input
                  type="checkbox"
                  disabled={snapshot.countdown !== null}
                  checked={snapshot.videoOptIn}
                  onChange={(e) => controller.setVideoOptIn(e.target.checked)}
                />
                <span>
                  Save a silent webcam recording on this device.
                  <small>
                    Optional. No microphone audio is included, and video is
                    never uploaded automatically.
                  </small>
                </span>
              </label>
              <label className="vc-checkbox">
                <input
                  type="checkbox"
                  disabled={snapshot.countdown !== null}
                  checked={snapshot.state.recordingConsent}
                  onChange={(e) => controller.consent(e.target.checked)}
                />
                <span>
                  I’m ready for the app to record and save my movement landmarks
                  {snapshot.videoOptIn ? " and webcam video" : ""}.
                </span>
              </label>
              {!snapshot.state.tracking && (
                <label className="vc-checkbox">
                  <input
                    type="checkbox"
                    checked={snapshot.state.reducedTrackingAcknowledged}
                    onChange={(e) =>
                      controller.acknowledgeTracking(e.target.checked)
                    }
                  />
                  <span>
                    Tracking is limited. I understand some movement may be
                    unassessable.
                  </span>
                </label>
              )}
              <button
                type="button"
                className="vc-primary vc-full"
                disabled={
                  snapshot.countdown !== null ||
                  !snapshot.state.recordingConsent ||
                  (!snapshot.state.tracking &&
                    !snapshot.state.reducedTrackingAcknowledged)
                }
                onClick={next}
              >
                {snapshot.countdown !== null
                  ? "Get comfortable…"
                  : "Start my turn"}
                <Play size={20} />
              </button>
            </section>
          )}
          {phase === "independent_recording" && (
            <IndependentPractice controller={controller} snapshot={snapshot} />
          )}
          {phase === "paused" && (
            <section className="vc-card">
              <h2>Take your time.</h2>
              <p>
                Movement recording is paused. The voice coach remains available;
                mute or disconnect whenever you want.
              </p>
              <button
                type="button"
                className="vc-primary"
                onClick={() => controller.resume()}
              >
                <Play size={20} />
                Resume practice
              </button>
            </section>
          )}
        </div>
      </div>
      {phase === "analyzing" && (
        <section className="vc-card vc-analysis-loading" role="status">
          <Flower2 size={40} />
          <h2>Gathering your movement.</h2>
          <p>
            Only the recording’s measured landmarks are used for these results.
          </p>
        </section>
      )}
      {phase === "results" && snapshot.session && (
        <CoachSessionResults
          session={snapshot.session}
          video={snapshot.video}
          saved={snapshot.saved}
          saving={snapshot.saving}
          onSave={() => void controller.save()}
          onFinish={() => {
            void controller.finish();
          }}
          onListen={(text) => {
            if (voice.status === "connected") voice.repeat(text);
            else void voice.connect();
          }}
        />
      )}
      {phase === "complete" && (
        <section className="vc-card vc-complete">
          <Flower2 size={55} />
          <h2>Another moment of care.</h2>
          <p>{snapshot.notice}</p>
          <button
            type="button"
            className="vc-primary"
            onClick={() => {
              if (props.onExit) props.onExit();
              else controller.reset();
            }}
          >
            Return to my garden
          </button>
          <button
            type="button"
            className="vc-secondary"
            onClick={() => controller.reset()}
          >
            <RotateCcw size={19} />
            Start a new practice
          </button>
        </section>
      )}
      {phase === "error" && (
        <section className="vc-card">
          <h2>Let’s take a moment.</h2>
          <p role="alert">{snapshot.state.error}</p>
          <button
            type="button"
            className="vc-primary"
            onClick={() => {
              voice.disconnect();
              controller.reset();
            }}
          >
            Return to the beginning
          </button>
        </section>
      )}
    </div>
  );
}
