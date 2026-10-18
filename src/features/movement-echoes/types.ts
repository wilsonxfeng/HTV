import type { Vec3 } from '../../lib/types';

export type Point = { x: number; y: number };
export type Palm = [Point, Point, Point, Point];
export interface EchoFrame {
  tMs: number;
  image: Vec3[];
  world: Vec3[];
  spread: number | null;
  valid: boolean;
}
export interface Repetition {
  /** Imported footage can begin after the outward movement has already occurred. */
  partial?: 'start';
  /** Measured monotone movement phase, including holds; timestamps remain in the original video clock. */
  phaseMap?: { phase: number; tMs: number }[];
  startMs: number;
  peakMs: number;
  endMs: number;
  valid: boolean;
  coverage: number;
  peakSpread: number;
  manual?: boolean;
  /** A real still pose, explicitly not a detected repetition or moving phase. */
  static?: boolean;
}
export interface EchoSession {
  trackingMode?: 'hand' | 'pose';
  bodyRegion?: 'hand' | 'arm' | 'leg' | 'core';
  cameraView?: 'front' | 'side' | 'three-quarter';
  baselineImage?: Vec3[];
  analysisVersion?: string;
  id: string;
  name: string;
  createdAt: string;
  exerciseId: string;
  selectedHand: 'Left' | 'Right' | 'Unconfirmed';
  /** Encoding orientation; pixels and image landmarks always use this same space. */
  mirrored: boolean;
  demonstration: boolean;
  /** Explicit, visually verified demo grouping; never a substitute for personal hand confirmation. */
  comparisonGroup?: string;
  video: Blob;
  videoWidth: number;
  videoHeight: number;
  videoDurationMs: number;
  /** videoTime = landmarkTime + offset; zero when inferred from this video. */
  landmarkOffsetMs: number;
  frames: EchoFrame[];
  repetitions: Repetition[];
  sourceFingerprint: string;
}
export interface SegmentationConfig {
  colorTolerance: number;
  feather: number;
  sampleCount: number;
}
export interface MaskQuality {
  score: number;
  valid: boolean;
  palmRetained: number;
  tipsRetained: number;
  edgeLeak: number;
  area: number;
  warnings: string[];
}
export interface GhostFrame {
  phase: number;
  tMs: number;
  image: Blob;
  width: number;
  height: number;
  anchors: Palm;
  quality: MaskQuality;
}
export interface GhostCache {
  key: string;
  sessionId: string;
  repetitionIndex: number;
  version: string;
  config: SegmentationConfig;
  frames: GhostFrame[];
  sourceFingerprint: string;
}
export interface ProcessingUpdate {
  stage: string;
  completed: number;
  total: number;
  sessionName: string;
}
export const DEFAULT_CONFIG: SegmentationConfig = {
  colorTolerance: 1,
  feather: 1,
  sampleCount: 32,
};
export const PROCESSING_VERSION = 'pixels-v3';
