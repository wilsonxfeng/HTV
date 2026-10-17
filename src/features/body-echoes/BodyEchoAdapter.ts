import type { MotionSession } from '../../lib/types';
import type { VideoMetadata } from '../clinical-data/contracts';
import type { EchoSession } from '../movement-echoes/types';
import { bodySignal } from '../body-tracking/poseMetrics';
import { detectBodyRepetitions } from '../body-exercises/repetitionDetection';
import { getExercise } from '../body-exercises/exerciseRegistry';

export function toBodyEchoSession(motion: MotionSession, video: Blob, metadata: VideoMetadata, demonstration = false): EchoSession {
  const signal = bodySignal(motion), exercise = getExercise(motion.exerciseId);
  return {
    id: motion.id, name: new Date(motion.createdAt).toLocaleString(), createdAt: motion.createdAt,
    exerciseId: exercise.id, selectedHand: motion.hand, mirrored: metadata.mirrored, demonstration,
    trackingMode: 'pose', bodyRegion: exercise.bodyRegion, cameraView: motion.cameraView,
    baselineImage: motion.calibration.imageNeutral, analysisVersion: motion.analysisVersion,
    video, videoWidth: metadata.width, videoHeight: metadata.height, videoDurationMs: metadata.durationMs,
    landmarkOffsetMs: metadata.landmarkOffsetMs, sourceFingerprint: metadata.sha256,
    frames: motion.frames.map((frame, i) => ({tMs: frame.t * 1000, image: frame.imageLandmarks ?? [], world: frame.worldLandmarks ?? [], spread: signal[i].value, valid: signal[i].valid && signal[i].value !== null})),
    repetitions: detectBodyRepetitions(bodySignal(motion, metadata.landmarkOffsetMs), exercise.experimental ? .12 : 8),
  };
}
