import {
  averageHands,
  getPhase,
  isValidHand,
  pairAngles,
} from "../../../lib/geometry";
import { initialCoachState, transitionCoach } from "./coachingStateMachine";
import type { CoachAction } from "./coachingStateMachine";
import { RepetitionController } from "./repetitionController";
import { TrackingEvents } from "./exerciseEvents";
import {
  ANALYSIS_VERSION,
  addSessionComparison,
  evaluateCompletedSession,
  referenceVersion,
} from "./sessionEvaluator";
import { generateCoachSummary, structuredSummary } from "./summaryGenerator";
import { SynchronizedRecorder } from "../recording/synchronizedRecorder";
import { recordingRepository } from "../recording/recordingRepository";
import { GardenRewardDispatcher } from "../adapters/sessionAdapter";
import { phaseInstructions } from "../elevenlabs/coachConfiguration";
import type {
  Calibration,
  CoachPhase,
  CoachSessionRecord,
  CoachState,
  CoachingEvent,
  CoachingEventPayload,
  HandSide,
  RepetitionMarker,
  TrackingMarker,
  Vec3,
  VoiceCoachExperienceProps,
} from "../types/coach";

export interface GuidedSnapshot {
  state: CoachState;
  caption: string;
  hand: HandSide;
  videoOptIn: boolean;
  neutralComplete: boolean;
  capturing: "neutral" | "target" | null;
  captureProgress: number;
  countdown: number | null;
  starting: boolean;
  elapsedMs: number;
  guidedElapsedMs: number;
  session: CoachSessionRecord | null;
  video: Blob | null;
  saved: boolean;
  saving: boolean;
  notice: string;
  cameraBusy: boolean;
  cameraError: string;
  events: CoachingEvent[];
}
type Capture = {
  kind: "neutral" | "target";
  started: number;
  stable: number;
  lastObserved: number;
  anchor: Vec3[];
  points: Vec3[][];
};
export class GuidedSessionController {
  private listeners = new Set<() => void>();
  private options: VoiceCoachExperienceProps;
  private snapshot: GuidedSnapshot;
  private calibration: Calibration | null;
  private neutral: Vec3[] = [];
  private capture: Capture | null = null;
  private recorder: SynchronizedRecorder;
  private repetition: RepetitionController | null = null;
  private markers: RepetitionMarker[] = [];
  private trackingMarkers: TrackingMarker[] = [];
  private tracking = new TrackingEvents();
  private reward = new GardenRewardDispatcher();
  private epoch = 0;
  private sessionId = crypto.randomUUID();
  private sequence = 0;
  private lastFrame = -1;
  private lastVisibleTracking = false;
  private stageStart = 0;
  private countdownDeadline = 0;
  private pauseElapsed = 0;
  private startedAt = "";
  private finishing = false;
  private savedCallback = false;
  private rewarding = false;
  constructor(
    options: VoiceCoachExperienceProps,
    private now: () => number = () => performance.now(),
    recorder?: SynchronizedRecorder,
  ) {
    this.options = options;
    this.calibration =
      options.initialCalibration?.source !== "demo"
        ? (options.initialCalibration ?? null)
        : null;
    this.recorder = recorder ?? new SynchronizedRecorder(now);
    this.snapshot = {
      state: initialCoachState(),
      caption: phaseInstructions.idle,
      hand: options.initialCalibration?.hand ?? "Right",
      videoOptIn: false,
      neutralComplete: !!this.calibration,
      capturing: null,
      captureProgress: 0,
      countdown: null,
      starting: false,
      elapsedMs: 0,
      guidedElapsedMs: 0,
      session: null,
      video: null,
      saved: false,
      saving: false,
      notice: "",
      cameraBusy: false,
      cameraError: "",
      events: [],
    };
  }
  updateOptions(options: VoiceCoachExperienceProps) {
    this.options = options;
  }
  getSnapshot = () => this.snapshot;
  getSessionId = () => this.sessionId;
  getCalibration = () => this.calibration;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private patch(values: Partial<GuidedSnapshot>) {
    this.snapshot = { ...this.snapshot, ...values };
    this.listeners.forEach((listener) => listener());
  }
  private event(payload: CoachingEventPayload) {
    const state = this.snapshot.state;
    this.patch({
      events: [
        ...this.snapshot.events.slice(-80),
        {
          ...payload,
          id: `${this.sessionId}:${++this.sequence}`,
          sequence: this.sequence,
          sessionId: this.sessionId,
          phase: state.phase,
          revision: state.revision,
          timestampMs: this.now(),
        },
      ],
    });
  }
  dispatch(action: CoachAction) {
    const previous = this.snapshot.state;
    const state = transitionCoach(previous, action);
    if (state === previous) return false;
    this.patch({
      state,
      ...(state.phase !== previous.phase
        ? { caption: phaseInstructions[state.phase] }
        : {}),
    });
    if (state.phase !== previous.phase) this.stageStart = this.now();
    return true;
  }
  begin = () => {
    this.dispatch({ type: "BEGIN" });
  };
  setHand = (hand: HandSide) => {
    if (
      this.snapshot.state.phase !== "calibration" ||
      this.capture ||
      this.neutral.length ||
      this.calibration
    )
      return;
    this.patch({ hand });
  };
  setPlan = (value: 3 | 4 | 5) => this.dispatch({ type: "PLAN", value });
  consent = (value: boolean) => this.dispatch({ type: "CONSENT", value });
  acknowledgeTracking = (value: boolean) =>
    this.dispatch({ type: "ACKNOWLEDGE_TRACKING", value });
  acknowledgeReference = (value: boolean) =>
    this.dispatch({ type: "ACKNOWLEDGE_REFERENCE", value });
  setVideoOptIn = (videoOptIn: boolean) => {
    if (
      !this.snapshot.starting &&
      this.snapshot.countdown === null &&
      ![
        "independent_recording",
        "paused",
        "analyzing",
        "results",
        "complete",
      ].includes(this.snapshot.state.phase)
    )
      this.patch({ videoOptIn });
  };
  async enableCamera() {
    if (this.snapshot.cameraBusy || this.snapshot.state.phase !== "permissions")
      return;
    const epoch = this.epoch;
    this.patch({ cameraBusy: true, cameraError: "" });
    try {
      await this.options.motionAdapter.start();
      if (epoch !== this.epoch) {
        this.options.motionAdapter.stop();
        return;
      }
      this.dispatch({ type: "CAMERA_READY" });
      if (
        this.calibration &&
        isValidHand(this.calibration.neutral) &&
        isValidHand(this.calibration.target)
      )
        this.patch({ state: { ...this.snapshot.state, calibrated: true } });
    } catch (error) {
      if (epoch === this.epoch)
        this.patch({
          cameraError:
            error instanceof Error
              ? error.message
              : "Camera access failed. Retry camera access.",
        });
    } finally {
      if (epoch === this.epoch) this.patch({ cameraBusy: false });
    }
  }
  capturePose(kind: "neutral" | "target") {
    const sample = this.options.motionAdapter.getSample();
    if (
      this.snapshot.state.phase !== "calibration" ||
      !sample?.tracking ||
      !isValidHand(sample.landmarks) ||
      this.now() - sample.observedAt > 200 ||
      (kind === "target" && !this.neutral.length)
    )
      return;
    const now = this.now();
    this.capture = {
      kind,
      started: now,
      stable: now,
      lastObserved: sample.observedAt,
      anchor: sample.landmarks,
      points: [],
    };
    this.patch({
      capturing: kind,
      captureProgress: 0,
      notice: "Hold comfortably still for a moment.",
    });
  }
  private measureCalibration() {
    const capture = this.capture;
    if (!capture) return;
    const now = this.now(),
      sample = this.options.motionAdapter.getSample();
    if (now - capture.started > 12000) {
      this.capture = null;
      this.patch({
        capturing: null,
        notice:
          "We could not measure a steady pose. Rest your arm, improve the lighting, and retry.",
      });
      return;
    }
    if (!sample || sample.observedAt === capture.lastObserved) return;
    const motion =
      sample.tracking && isValidHand(sample.landmarks)
        ? Math.sqrt(
            sample.landmarks.reduce(
              (sum, p, i) =>
                sum +
                (p.x - capture.anchor[i].x) ** 2 +
                (p.y - capture.anchor[i].y) ** 2 +
                (p.z - capture.anchor[i].z) ** 2,
              0,
            ) / 21,
          )
        : Infinity;
    if (
      sample.observedAt - capture.lastObserved > 200 ||
      !sample.tracking ||
      motion > 0.07
    ) {
      capture.points = [];
      capture.stable = now;
      if (sample.tracking && isValidHand(sample.landmarks))
        capture.anchor = sample.landmarks;
    }
    capture.lastObserved = sample.observedAt;
    if (!sample.tracking || !isValidHand(sample.landmarks)) {
      this.patch({ captureProgress: 0 });
      return;
    }
    capture.points.push(sample.landmarks);
    this.patch({ captureProgress: Math.min(1, (now - capture.stable) / 1200) });
    if (now - capture.stable < 1200 || capture.points.length < 8) return;
    const measured = averageHands(capture.points);
    this.capture = null;
    this.patch({ capturing: null, captureProgress: 0 });
    if (pairAngles(measured).length !== 4) {
      this.patch({ notice: "This pose was not clear enough. Please retry." });
      return;
    }
    if (capture.kind === "neutral") {
      this.neutral = measured;
      this.options.motionAdapter.lockIdentity?.(sample.modelHandedness ?? null);
      this.patch({
        neutralComplete: true,
        notice:
          "Neutral captured. Slowly spread toward your comfortable goal, then capture that pose.",
      });
    } else {
      const neutral = pairAngles(this.neutral),
        target = pairAngles(measured);
      if (!target.slice(1).some((angle, i) => angle - neutral[i + 1] >= 2)) {
        this.patch({
          notice:
            "No clear change from neutral was measured. Retry within your comfortable range or use a clinician-provided reference.",
        });
        return;
      }
      this.calibration = {
        hand: this.snapshot.hand,
        neutral: this.neutral,
        target: measured,
        source: "personal",
        createdAt: new Date().toISOString(),
      };
      this.dispatch({ type: "CALIBRATED" });
      this.event({ type: "CALIBRATION_COMPLETE" });
      this.patch({ notice: "Your comfortable opening goal is ready." });
    }
  }
  next(requestedPhase?: CoachPhase, expectedRevision?: number): boolean {
    if (this.snapshot.starting || this.snapshot.countdown !== null)
      return false;
    const state = this.snapshot.state;
    if (state.phase === "independent_intro") {
      const next = transitionCoach(state, {
        type: "NEXT",
        requestedPhase,
        expectedRevision,
      });
      if (next === state) {
        this.patch({
          notice:
            "Confirm recording consent, your reference, and camera tracking before starting.",
        });
        return false;
      }
      this.countdownDeadline = this.now() + 3000;
      this.patch({ countdown: 3, notice: "" });
      return true;
    }
    return this.dispatch({ type: "NEXT", requestedPhase, expectedRevision });
  }
  pause() {
    if (this.snapshot.starting) {
      void this.stop();
      return;
    }
    if (this.snapshot.countdown !== null) {
      this.countdownDeadline = 0;
      this.patch({ countdown: null });
    }
    const phase = this.snapshot.state.phase;
    this.pauseElapsed = this.now() - this.stageStart;
    if (this.dispatch({ type: "PAUSE" })) {
      if (phase === "independent_recording") this.recorder.pause();
      this.capture = null;
      this.patch({ capturing: null });
      this.repetition?.resetCycle();
      this.event({ type: "SESSION_PAUSED" });
    }
  }
  resume(expectedRevision?: number) {
    if (
      expectedRevision !== undefined &&
      expectedRevision !== this.snapshot.state.revision
    )
      return false;
    if (!this.dispatch({ type: "RESUME" })) return false;
    this.stageStart = this.now() - this.pauseElapsed;
    if (this.snapshot.state.phase === "independent_recording")
      this.recorder.resume();
    this.repetition?.resetCycle();
    return true;
  }
  stop = async () => {
    if (this.snapshot.starting) {
      this.epoch++;
      this.recorder.abort();
      this.options.motionAdapter.stop();
      this.dispatch({ type: "RESET" });
      this.patch({ starting: false, countdown: null });
      return;
    }
    this.countdownDeadline = 0;
    this.patch({ countdown: null });
    const wasRecording =
      this.snapshot.state.phase === "independent_recording" ||
      (this.snapshot.state.phase === "paused" &&
        this.snapshot.state.resumePhase === "independent_recording");
    if (wasRecording) await this.finalize();
    else {
      this.dispatch({ type: "STOP" });
      this.capture = null;
      this.patch({ capturing: null });
      this.options.motionAdapter.stop();
    }
  };
  manualRepetition() {
    if (
      this.snapshot.state.phase !== "independent_recording" ||
      this.snapshot.starting ||
      this.snapshot.state.completedRepetitions >=
        this.snapshot.state.plannedRepetitions
    )
      return;
    const frames = this.recorder.getFrames(),
      end = this.recorder.elapsed(),
      start = this.markers.at(-1)?.endMs ?? 0;
    const valid = frames.filter((f) => f.tracking && f.t * 1000 >= start);
    if (end - start < 1500 || valid.length < 8) {
      this.patch({
        notice:
          "Complete a gentle spread-and-close cycle while your hand is visible before confirming a repetition.",
      });
      return;
    }
    this.completeRepetition({
      id: `manual-${this.markers.length + 1}`,
      startMs: start,
      peakMs: (start + end) / 2,
      endMs: end,
      source: "manual",
      peakSpread: null,
    });
  }
  private completeRepetition(marker: RepetitionMarker) {
    const count = this.snapshot.state.completedRepetitions + 1;
    if (!this.dispatch({ type: "REPETITION", count })) return;
    this.markers.push(marker);
    this.repetition?.setCount(count);
    this.event({ type: "REPETITION_COMPLETED", count });
    if (count >= this.snapshot.state.plannedRepetitions) {
      this.event({ type: "SESSION_COMPLETE", count });
      void this.finalize();
    }
  }
  private async startRecording() {
    if (
      this.snapshot.starting ||
      !this.dispatch({ type: "NEXT", requestedPhase: "independent_recording" })
    ) {
      this.patch({ countdown: null });
      return;
    }
    const epoch = this.epoch;
    this.patch({ countdown: null, starting: true });
    try {
      await this.recorder.start(
        this.options.motionAdapter.getStream(),
        this.snapshot.videoOptIn,
      );
      if (epoch !== this.epoch) {
        this.recorder.abort();
        return;
      }
      this.startedAt = new Date().toISOString();
      this.markers = [];
      this.lastVisibleTracking = this.snapshot.state.tracking;
      this.trackingMarkers = [
        { timestampMs: 0, tracking: this.lastVisibleTracking },
      ];
      this.lastFrame = -1;
      this.repetition = new RepetitionController(
        this.calibration,
        this.snapshot.state.plannedRepetitions,
      );
      this.patch({ starting: false, elapsedMs: 0, notice: "" });
      this.event({ type: "INDEPENDENT_PRACTICE_STARTED" });
    } catch (error) {
      if (epoch === this.epoch) {
        this.patch({ starting: false });
        this.dispatch({
          type: "ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Recording could not begin.",
        });
      }
    }
  }
  tick(hidden = false) {
    const state = this.snapshot.state;
    if (
      ["idle", "complete", "results", "error", "analyzing"].includes(
        state.phase,
      )
    )
      return;
    const sample = this.options.motionAdapter.getSample();
    const tracked = Boolean(
      sample?.tracking &&
      isValidHand(sample.landmarks) &&
      this.now() - sample.observedAt <= 200 &&
      !hidden,
    );
    this.dispatch({ type: "TRACKING", value: tracked });
    const event = this.tracking.update(tracked, this.now());
    if (event) {
      this.event({ type: event });
      if (event === "TRACKING_LOST")
        this.patch({
          notice: "Tracking lost. Move the same hand fully into view.",
        });
    }
    if (state.phase === "calibration") this.measureCalibration();
    if (this.snapshot.countdown !== null) {
      if (this.now() >= this.countdownDeadline) {
        this.countdownDeadline = 0;
        void this.startRecording();
      } else
        this.patch({
          countdown: Math.ceil((this.countdownDeadline - this.now()) / 1000),
        });
    }
    if (state.phase === "guided_demo" || state.phase === "guided_practice") {
      const elapsed = this.now() - this.stageStart,
        phase = getPhase(elapsed / 1000, 10);
      const captions = {
        Together: "Start with fingers comfortably together.",
        Spread: "Slowly spread toward your comfortable goal.",
        Hold: "Hold comfortably for a moment.",
        Close: "Gently bring your fingers together.",
      };
      this.patch({
        guidedElapsedMs: Math.min(10000, elapsed),
        caption: captions[phase.name],
      });
      if (state.phase === "guided_practice" && elapsed >= 10000) {
        this.dispatch({ type: "GUIDED_DONE" });
        this.event({ type: "GUIDED_PRACTICE_COMPLETE" });
      }
    }
    if (state.phase === "independent_recording" && !this.snapshot.starting) {
      this.recorder.capture(sample, hidden);
      const elapsedMs = this.recorder.elapsed();
      this.patch({ elapsedMs });
      if (tracked !== this.lastVisibleTracking) {
        this.trackingMarkers.push({
          timestampMs: elapsedMs,
          tracking: tracked,
        });
        this.lastVisibleTracking = tracked;
      }
      const frames = this.recorder.getFrames(),
        latest = frames.at(-1);
      if (latest && latest.t > this.lastFrame) {
        this.lastFrame = latest.t;
        const marker = this.repetition?.observe(latest);
        if (marker) this.completeRepetition(marker);
      }
      if (elapsedMs >= 180000) {
        this.patch({
          notice:
            "The three-minute recording limit was reached. Your captured practice is retained.",
        });
        void this.finalize();
      }
      if (this.options.motionAdapter.getStatus().status === "error")
        void this.finalize();
    }
  }
  private async finalize() {
    if (this.finishing) return;
    this.finishing = true;
    const epoch = this.epoch;
    if (
      !this.dispatch({ type: "STOP" }) ||
      this.snapshot.state.phase !== "analyzing"
    ) {
      this.finishing = false;
      return;
    }
    this.event({ type: "SESSION_STOPPED" });
    try {
      const artifact = await this.recorder.stop();
      if (epoch !== this.epoch) return;
      this.options.motionAdapter.stop();
      const evaluation = evaluateCompletedSession(
        artifact.frames,
        this.calibration,
        this.markers,
        artifact.durationMs,
      );
      const calibrated = this.calibration ?? {
        hand: this.snapshot.hand,
        neutral: [],
        target: [],
        source: "personal" as const,
        createdAt: this.startedAt,
      };
      let session: CoachSessionRecord = {
        id: this.sessionId,
        exerciseId: "finger_spread_close",
        hand: this.snapshot.hand,
        startedAt: this.startedAt,
        completedAt: new Date().toISOString(),
        plannedRepetitions: this.snapshot.state.plannedRepetitions,
        completedRepetitions: this.markers.length,
        status:
          evaluation.metrics.assessedRepetitions === 0 ||
          evaluation.metrics.trackingQuality === "insufficient"
            ? "unassessable"
            : this.markers.length >= this.snapshot.state.plannedRepetitions
              ? "completed"
              : "partial",
        metrics: evaluation.metrics,
        events: evaluation.events,
        recordingId: artifact.blob ? this.sessionId : undefined,
        videoAvailable: Boolean(artifact.blob),
        videoMetadata: artifact.metadata,
        repetitions: [...this.markers],
        trackingMarkers: [...this.trackingMarkers],
        referenceVersion: referenceVersion(this.calibration),
        analysisVersion: ANALYSIS_VERSION,
        coachSummary: "",
        source: "camera",
        motionSession: {
          id: this.sessionId,
          createdAt: this.startedAt,
          hand: this.snapshot.hand,
          duration: artifact.durationMs / 1000,
          cycleDuration: this.markers.length
            ? artifact.durationMs / 1000 / this.markers.length
            : 10,
          frames: artifact.frames,
          calibration: calibrated,
          source: "camera",
        },
      };
      try {
        session = addSessionComparison(
          session,
          await (this.options.repository ?? recordingRepository).list(),
        );
      } catch {
        /* evaluation can finish when local storage is unavailable */
      }
      session.coachSummary = generateCoachSummary(session);
      this.patch({
        session,
        video: artifact.blob,
        notice: artifact.warning ?? "",
        elapsedMs: artifact.durationMs,
      });
      this.dispatch({ type: "ANALYSIS_READY" });
      this.event({
        type: "ANALYSIS_READY",
        summary: structuredSummary(session),
      });
      await this.save();
    } catch (error) {
      if (epoch === this.epoch)
        this.dispatch({
          type: "ERROR",
          message:
            error instanceof Error
              ? error.message
              : "The recording could not be finalized.",
        });
    } finally {
      this.finishing = false;
    }
  }
  async save() {
    const session = this.snapshot.session;
    if (!session || this.snapshot.saving) return;
    this.patch({ saving: true });
    try {
      const saved = await (this.options.repository ?? recordingRepository).save(
        session,
        this.snapshot.video,
      );
      if (!this.savedCallback) {
        await this.options.onSessionComplete?.(saved);
        this.savedCallback = true;
      }
      this.patch({
        session: saved,
        saved: true,
        notice:
          session.videoAvailable && !saved.videoAvailable
            ? "Local storage is full. Measurements were saved; video could not be saved. Export the video now if you want a copy."
            : "Practice saved on this device.",
      });
    } catch {
      this.patch({
        notice:
          "This practice could not be fully saved. Keep this page open to export the recording or retry Save.",
      });
    } finally {
      this.patch({ saving: false });
    }
  }
  async finish() {
    const session = this.snapshot.session;
    if (!session || this.snapshot.state.phase !== "results" || this.rewarding)
      return;
    if (!this.snapshot.saved) {
      this.patch({
        notice:
          "Save this practice before finishing so your progress is retained.",
      });
      return;
    }
    this.rewarding = true;
    try {
      const rewarded = await this.reward.deliver(
        session,
        this.options.onGardenReward,
        (record) =>
          (this.options.repository ?? recordingRepository).save(record),
      );
      this.patch({
        session: rewarded ? { ...session, rewardDelivered: true } : session,
        notice:
          session.status !== "completed"
            ? "This partial or unclear recording is retained for review. No completion reward was issued."
            : this.options.onGardenReward
              ? "Your garden completion event was delivered."
              : "Practice complete. The host app can connect its garden reward here.",
      });
      this.dispatch({ type: "FINISH" });
    } catch {
      this.patch({
        notice:
          "Your practice is saved. The garden update could not complete; you can retry Finish.",
      });
    } finally {
      this.rewarding = false;
    }
  }
  reset() {
    this.epoch++;
    this.recorder.abort();
    this.options.motionAdapter.stop();
    this.capture = null;
    this.calibration =
      this.options.initialCalibration?.source !== "demo"
        ? (this.options.initialCalibration ?? null)
        : null;
    this.neutral = [];
    this.markers = [];
    this.sessionId = crypto.randomUUID();
    this.sequence = 0;
    this.savedCallback = false;
    this.finishing = false;
    this.countdownDeadline = 0;
    this.tracking = new TrackingEvents();
    this.dispatch({ type: "RESET" });
    this.patch({
      caption: phaseInstructions.idle,
      session: null,
      video: null,
      saved: false,
      saving: false,
      countdown: null,
      starting: false,
      capturing: null,
      captureProgress: 0,
      neutralComplete: !!this.calibration,
      elapsedMs: 0,
      guidedElapsedMs: 0,
      notice: "",
      cameraError: "",
      cameraBusy: false,
      events: [],
    });
  }
  dispose() {
    this.epoch++;
    this.recorder.abort();
    this.options.motionAdapter.stop();
    this.listeners.clear();
  }
}
