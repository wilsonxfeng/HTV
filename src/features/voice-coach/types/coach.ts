import type { RefObject } from "react";
import type {
  Calibration,
  HandFrame,
  HandSide,
  MotionSession,
  Vec3,
} from "../../../lib/types";
export type { Calibration, HandFrame, HandSide, MotionSession, Vec3 };

export type CoachPhase =
  | "idle"
  | "permissions"
  | "calibration"
  | "guided_demo"
  | "guided_practice"
  | "independent_intro"
  | "independent_recording"
  | "analyzing"
  | "results"
  | "complete"
  | "paused"
  | "error";
export interface MotionSample extends HandFrame {
  observedAt: number;
  reason?: string;
}
export interface MotionAdapter {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  start(): Promise<void>;
  stop(): void;
  getSample(): MotionSample | null;
  getStream(): MediaStream | null;
  getStatus(): { status: string; error?: string };
  lockIdentity?(label: string | null): void;
}
export interface CoachState {
  phase: CoachPhase;
  revision: number;
  resumePhase: CoachPhase | null;
  cameraGranted: boolean;
  recordingConsent: boolean;
  tracking: boolean;
  reducedTrackingAcknowledged: boolean;
  calibrated: boolean;
  referenceLimitationsAcknowledged: boolean;
  plannedRepetitions: 3 | 4 | 5;
  completedRepetitions: number;
  guidedComplete: boolean;
  error: string | null;
}
export interface RepetitionMarker {
  id: string;
  startMs: number;
  peakMs: number;
  endMs: number;
  source: "vision" | "manual";
  peakSpread: number | null;
}
export interface TrackingMarker {
  timestampMs: number;
  tracking: boolean;
}
export interface EvaluationEvent {
  id: string;
  timestampMs: number;
  repetition: number;
  metric: string;
  observedDegrees: number;
  targetDegrees: number;
  severity: "notice";
  description: string;
}
export interface PairMeasurement {
  pair: string;
  observedDegrees: number | null;
  targetDegrees: number;
  neutralDegrees: number;
  attainmentPercent: number | null;
}
export interface ExerciseMetrics {
  pairs: PairMeasurement[];
  targetAttainmentPercent: number | null;
  trackingPercent: number;
  trackingQuality: "good" | "limited" | "insufficient";
  consistencyDegrees: number | null;
  assessedRepetitions: number;
  comparison: {
    previousSessionId: string;
    targetAttainmentChange: number | null;
    pairs: { pair: string; changeDegrees: number }[];
  } | null;
}
export interface CoachSummary {
  exercise: "finger_spread_close";
  completedRepetitions: number;
  plannedRepetitions: number;
  trackingQuality: ExerciseMetrics["trackingQuality"];
  targetAttainmentPercent: number | null;
  strongestMeasuredDifference: {
    fingerPair: string;
    observedDegrees: number;
    targetDegrees: number;
  } | null;
  status: "completed" | "partial" | "unassessable";
}
export interface VideoMetadata {
  mimeType: string;
  durationMs: number;
  startOffsetMs: number;
  synchronization: "measured-browser-clock";
  pauseIntervals: { startMs: number; endMs: number }[];
  warning?: string;
}
export interface CoachSessionRecord {
  id: string;
  exerciseId: "finger_spread_close";
  hand: HandSide;
  startedAt: string;
  completedAt: string;
  plannedRepetitions: number;
  completedRepetitions: number;
  status: CoachSummary["status"];
  metrics: ExerciseMetrics;
  events: EvaluationEvent[];
  recordingId?: string;
  videoAvailable: boolean;
  videoMetadata?: VideoMetadata;
  repetitions: RepetitionMarker[];
  trackingMarkers: TrackingMarker[];
  referenceVersion: string;
  analysisVersion: string;
  coachSummary: string;
  motionSession: MotionSession;
  source: "camera" | "demo";
  rewardDelivered?: boolean;
}
export interface RecordingArtifact {
  blob: Blob | null;
  frames: HandFrame[];
  durationMs: number;
  metadata?: VideoMetadata;
  warning?: string;
}
export interface GardenCompletionEvent {
  id: string;
  sessionId: string;
  completedRepetitions: number;
  source: "camera" | "demo";
}
export interface CoachSessionRepository {
  save(
    session: CoachSessionRecord,
    video?: Blob | null,
  ): Promise<CoachSessionRecord>;
  list(): Promise<CoachSessionRecord[]>;
  get(id: string): Promise<CoachSessionRecord | undefined>;
  getVideo(id: string): Promise<Blob | undefined>;
  delete(id: string): Promise<void>;
}
export interface VoiceConfiguration {
  agentId?: string;
  tokenEndpoint?: string;
  connectionType?: "webrtc" | "websocket";
}
export interface VoiceCoachExperienceProps {
  motionAdapter: MotionAdapter;
  repository?: CoachSessionRepository;
  voiceConfiguration?: VoiceConfiguration;
  initialCalibration?: Calibration;
  onSessionComplete?: (session: CoachSessionRecord) => void | Promise<void>;
  onGardenReward?: (event: GardenCompletionEvent) => void | Promise<void>;
  onExit?: () => void;
}
export type CoachingEventPayload =
  | {
      type:
        | "HAND_DETECTED"
        | "TRACKING_LOST"
        | "CALIBRATION_COMPLETE"
        | "GUIDED_PRACTICE_COMPLETE"
        | "INDEPENDENT_PRACTICE_STARTED"
        | "SESSION_PAUSED"
        | "SESSION_STOPPED";
    }
  | { type: "REPETITION_COMPLETED" | "SESSION_COMPLETE"; count: number }
  | { type: "ANALYSIS_READY"; summary: CoachSummary };
export type CoachingEvent = CoachingEventPayload & {
  id: string;
  sequence: number;
  sessionId: string;
  phase: CoachPhase;
  revision: number;
  timestampMs: number;
};
