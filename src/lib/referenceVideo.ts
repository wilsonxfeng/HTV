import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { averageHands, normalizeHand, pairAngles } from './geometry';
import type { Vec3 } from './types';

export interface ReferenceVideoResult { neutral: Vec3[]; target: Vec3[]; frames: number; duration: number }
type Progress = (value: number) => void;
function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Reference import cancelled.', 'AbortError');
}
function waitForVideo(video: HTMLVideoElement, event: 'loadedmetadata' | 'seeked', signal?: AbortSignal, start?: () => void): Promise<void> {
  assertActive(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener(event, done); video.removeEventListener('error', fail); signal?.removeEventListener('abort', cancel); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('The reference video could not be decoded. Try another video format.')); };
    const cancel = () => { cleanup(); reject(new DOMException('Reference import cancelled.', 'AbortError')); };
    const timeout = window.setTimeout(fail, 15000);
    video.addEventListener(event, done, { once: true }); video.addEventListener('error', fail, { once: true }); signal?.addEventListener('abort', cancel, { once: true });
    try { start?.(); } catch { fail(); }
  });
}
/** Decodes a local exemplar in memory; only aggregate landmarks are retained. */
export async function extractReferenceFromVideo(file: File, onProgress: Progress = () => {}, signal?: AbortSignal): Promise<ReferenceVideoResult> {
  assertActive(signal);
  if (!file.type.startsWith('video/')) throw new Error('Choose a video file.');
  if (file.size > 250 * 1024 * 1024) throw new Error('Choose a video smaller than 250 MB.');
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  let detector: HandLandmarker | null = null;
  try {
    if (video.readyState < 1) await waitForVideo(video, 'loadedmetadata', signal);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration < 1 || duration > 90) throw new Error('Choose a reference clip between 1 and 90 seconds.');
    assertActive(signal);
    const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`);
    assertActive(signal);
    detector = await HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
    });
    const samples: { points: Vec3[]; spread: number }[] = [];
    const interval = Math.max(1 / 12, Math.min(0.12, duration / 180));
    const total = Math.max(1, Math.ceil(duration / interval));
    for (let index = 0; index < total; index++) {
      assertActive(signal);
      const time = Math.min(duration - 0.001, index * interval);
      if (video.readyState < 2 || Math.abs(video.currentTime-time) > 0.0001) await waitForVideo(video, 'seeked', signal, () => { video.currentTime = time; });
      assertActive(signal);
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
    const neutralAngles = pairAngles(neutral); const targetAngles = pairAngles(target);
    if (!neutralAngles.length || !targetAngles.length || !targetAngles.slice(1).some((angle, index) => angle - neutralAngles[index + 1] >= 2)) throw new Error('The clip did not show a clear together-to-spread movement. Choose a clip with the full exercise visible.');
    onProgress(1);
    return { neutral, target, frames: samples.length, duration };
  } finally {
    detector?.close(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
  }
}
