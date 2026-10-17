export interface Vec3 { x: number; y: number; z: number }
export type HandSide = 'Left' | 'Right';
export type ReferenceSource = 'personal' | 'clinician' | 'exemplar' | 'demo';
export interface HandFrame { t: number; landmarks: Vec3[]; worldLandmarks?: Vec3[]; imageLandmarks?: Vec3[]; confidence: number; tracking: boolean; modelHandedness?: string }
export interface Calibration {
  neutral: Vec3[];
  target: Vec3[];
  source: ReferenceSource;
  hand: HandSide;
  createdAt: string;
  exemplarName?: string;
  exemplarFrames?: number;
}
export interface MotionSession { id: string; exerciseId?: string; createdAt: string; hand: HandSide; duration: number; cycleDuration: number; frames: HandFrame[]; calibration: Calibration; source: 'camera' | 'demo'; completed?: boolean }
export interface PairMetric { pair: string; indices: [number, number]; neutral: number; target: number; achieved: number; attainment: number | null }
export interface Deviation { id: string; t: number; repetition: number; pair: string; indices: [number, number]; difference: number; actual: number; target: number; message: string }
export interface SessionAnalysis { pairs: PairMetric[]; deviations: Deviation[]; targetAttainment: number | null; trackingQuality: number; validFrames: number; repetitions: number }
export interface Phase { name: 'Together' | 'Spread' | 'Hold' | 'Close'; amount: number; repetition: number; progress: number }
