import type { HandSide, MotionSession, SessionAnalysis } from '../../lib/types';
import type { Repetition } from '../movement-echoes/types';

export interface VideoMetadata {
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number;
  height: number;
  durationMs: number;
  /** Video time = landmark time + offset. Never infer an offset from session dates. */
  landmarkOffsetMs: number;
  mirrored: boolean;
}
export interface CreateSession {
  bodyRegion?: MotionSession['bodyRegion'];
  trackingMode?: MotionSession['trackingMode'];
  cameraView?: MotionSession['cameraView'];
  targetSide?: MotionSession['targetSide'];
  analysisVersion?: string;
  segmentationCacheVersion?: string;
  id: string;
  patientId: string;
  exerciseId: string;
  hand: HandSide;
  startedAt: string;
  video: VideoMetadata;
  demonstration: boolean;
  videoKind: 'camera' | 'synthetic';
}
export interface GeneratedReport {
  patientSummary: string;
  clinicianSummary: string;
  limitations: string[];
  modelVersion: string;
  createdAt: string;
}
export interface SessionRecord extends CreateSession {
  status: 'pending' | 'complete';
  metrics: SessionAnalysis | null;
  repetitions: Repetition[];
  report: GeneratedReport | null;
}
export interface SessionDetail extends SessionRecord { motion: MotionSession }
export interface Patient {
  id: string;
  displayName: string;
  demonstration: boolean;
  schedule: { weekdays: number[]; timeZone: string } | null;
}
export interface PatientOverview extends Patient {
  totalSessions: number;
  lastPracticeAt: string | null;
  latestSpread: number | null;
  adherence: { attended: number; scheduled: number; percent: number | null };
}
export interface ProgressPoint {
  trackingMode?: MotionSession['trackingMode'];
  cameraView?: MotionSession['cameraView'];
  analysisVersion?: string;
  id: string;
  startedAt: string;
  hand: HandSide;
  exerciseId: string;
  targetKey: string;
  angle: number | null;
  trackingQuality: number;
  durationMs: number;
}
export interface SignedTransfer { url: string; headers: Record<string, string>; expiresAt: string }

export interface SessionRepository {
  patients(signal?: AbortSignal): Promise<PatientOverview[]>;
  sessions(patientId: string, signal?: AbortSignal): Promise<SessionRecord[]>;
  detail(id: string, signal?: AbortSignal): Promise<SessionDetail>;
  progress(patientId: string, signal?: AbortSignal): Promise<ProgressPoint[]>;
  video(id: string, signal?: AbortSignal): Promise<Blob>;
  report(id: string): Promise<GeneratedReport>;
  upload(session: CreateSession, motion: MotionSession, video: Blob, signal?: AbortSignal): Promise<SessionRecord>;
}
