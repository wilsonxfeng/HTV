import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { averageHands, normalizeHand, pairAngles } from './geometry';
import type { Vec3 } from './types';

export interface ReferenceVideoResult {
  neutral: Vec3[];
  target: Vec3[];
  frames: number;
  duration: number;
}

type Progress = (value: number) => void;

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('The reference video could not be read.')), { once: true });
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('The reference video could not be decoded.')); };
    const cleanup = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
    };
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', fail, { once: true });
    video.currentTime = time;
  });
}

/**
 * Extracts a candidate neutral and comfortable target from a local exemplar video.
 * The video is decoded in memory; only the aggregate landmarks are returned.
 * This is an exemplar, not proof that the person in the clip is a clinical gold standard.
 */
export async function extractReferenceFromVideo(file: File, onProgress: Progress = () => {}): Promise<ReferenceVideoResult> {
  if (!file.type.startsWith('video/')) throw new Error('Choose a video file.');
  if (file.size > 250 * 1024 * 1024) throw new Error('Choose a video smaller than 250 MB.');
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;
  let detector: HandLandmarker | null = null;
  try {
    await waitForMetadata(video);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration || duration > 90) throw new Error('Choose a reference clip between 1 and 90 seconds.');
    const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`);
    detector = await HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
    });
    const samples: { points: Vec3[]; spread: number }[] = [];
    const interval = Math.max(1 / 12, Math.min(0.12, duration / 180));
    const total = Math.max(1, Math.ceil(duration / interval));
    for (let index = 0; index < total; index += 1) {
      const time = Math.min(duration - 0.001, index * interval);
      await seek(video, time);
      const result = detector.detectForVideo(video, Math.round(time * 1000));
      const world = result.worldLandmarks[0];
      const points = world ? normalizeHand(world.map(point => ({ x: point.x, y: point.y, z: point.z }))) : [];
      const angles = pairAngles(points);
      if (points.length === 21 && angles.length === 4) samples.push({ points, spread: angles.slice(1).reduce((sum, angle) => sum + angle, 0) / 3 });
      onProgress((index + 1) / total);
    }
    if (samples.length < 12) throw new Error('The video did not contain enough clearly tracked hand frames. Use a well-lit, front-facing clip with one whole hand visible.');
    const ordered = [...samples].sort((a, b) => a.spread - b.spread);
    const bandSize = Math.max(3, Math.floor(ordered.length * 0.15));
    const neutral = averageHands(ordered.slice(0, bandSize).map(sample => sample.points));
    const target = averageHands(ordered.slice(-bandSize).map(sample => sample.points));
    const neutralAngles = pairAngles(neutral);
    const targetAngles = pairAngles(target);
    if (!neutralAngles.length || !targetAngles.length || !targetAngles.slice(1).some((angle, index) => angle - neutralAngles[index + 1] >= 2)) {
      throw new Error('The clip did not show a clear together-to-spread movement. Choose a clip with the full exercise visible.');
    }
    onProgress(1);
    return { neutral, target, frames: samples.length, duration };
  } finally {
    detector?.close();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
