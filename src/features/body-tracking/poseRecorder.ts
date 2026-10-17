import type { HandFrame, HandSide, MotionSession } from '../../lib/types';
import { SessionVideoCapture, videoHash } from '../clinical-data/capture';
import type { PoseSample } from './poseTracker';
import { BODY_ANALYSIS_VERSION, BODY_SEGMENTATION_VERSION, getExercise } from '../body-exercises/exerciseRegistry';
import { analyzeBodySession, poseIsVisible } from './poseMetrics';

/** One monotonic clock shared with MediaRecorder, excluding actual recorder pauses. */
export class PoseRecorder {
  private capture = new SessionVideoCapture();
  private control: ReturnType<SessionVideoCapture['start']>;
  private lastObserved = -1;
  readonly motion: MotionSession;
  paused = false;
  constructor(video: HTMLVideoElement, baseline: PoseSample, exerciseId: string, side: HandSide, target: number) {
    if (!baseline.tracking || performance.now() - baseline.observedAt > 300 || !poseIsVisible(baseline.imageLandmarks ?? [], baseline.worldLandmarks ?? [], exerciseId, side)) throw Error('Hold the starting position in view first.');
    const exercise = getExercise(exerciseId), startedAt = new Date().toISOString(), origin = performance.now();
    this.control = this.capture.start(video, origin, startedAt);
    this.motion = {id: crypto.randomUUID(), createdAt: startedAt, exerciseId, hand: side, targetSide: side, source: 'camera', trackingMode: 'pose', bodyRegion: exercise.bodyRegion, cameraView: exercise.cameraView, analysisVersion: BODY_ANALYSIS_VERSION, segmentationCacheVersion: BODY_SEGMENTATION_VERSION, repetitionTarget: target, duration: 0, cycleDuration: 8, frames: [], completed: false,
      calibration: {neutral: structuredClone(baseline.worldLandmarks!), target: structuredClone(baseline.worldLandmarks!), imageNeutral: structuredClone(baseline.imageLandmarks!), hand: side, source: 'personal', createdAt: startedAt}};
  }
  get elapsed() { return Math.max(0, this.control.elapsed()) / 1000; }
  sample(sample: PoseSample | null) {
    if (this.paused) return;
    const now = performance.now();
    const fresh = sample && now - sample.observedAt < 300 && !document.hidden;
    if (fresh && sample.observedAt === this.lastObserved) return;
    const t = Math.min(89.8, Math.max(0, this.control.elapsed(fresh ? sample.observedAt : now)) / 1000);
    if (t <= (this.motion.frames.at(-1)?.t ?? -1)) return;
    const frame: HandFrame = fresh ? {t, tracking: sample.tracking, confidence: sample.confidence, landmarks: sample.landmarks, worldLandmarks: sample.worldLandmarks, imageLandmarks: sample.imageLandmarks} : {t, tracking: false, confidence: 0, landmarks: []};
    this.motion.frames.push(structuredClone(frame)); this.lastObserved = sample?.observedAt ?? -1; this.motion.duration = t;
  }
  pause() { if (this.paused) return; this.control.pause(); this.paused = true; const t = Math.max(this.elapsed, (this.motion.frames.at(-1)?.t ?? 0) + .001); this.motion.frames.push({t, tracking: false, confidence: 0, landmarks: []}); }
  resume() { if (!this.paused) return; this.control.resume(); this.paused = false; }
  stop() { this.control.stop(); }
  async finish(interrupted = false) {
    const duration = this.elapsed; this.stop();
    const captured = await this.capture.finish();
    this.motion.duration = Math.max(duration, this.motion.frames.at(-1)?.t ?? 0);
    this.motion.completed = !interrupted && analyzeBodySession(this.motion).repetitions >= (this.motion.repetitionTarget ?? 3);
    return {motion: this.motion, video: captured.video, metadata: {...captured.metadata, sha256: await videoHash(captured.video)}};
  }
}
