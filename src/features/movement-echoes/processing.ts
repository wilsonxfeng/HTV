import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { normalizeHand, pairAngles } from '../../lib/geometry';
import {
  detectRepetitions,
  frameAtTime,
  palmAnchors,
  phaseToTime,
} from './geometry';
import { echoRepository } from './repository';
import { segmentHand } from './segmentHand';
import { canvasBlob, checkAbort, loadVideo, seekVideo } from './video';
import { PROCESSING_VERSION } from './types';
import type {
  EchoFrame,
  EchoSession,
  GhostCache,
  ProcessingUpdate,
  SegmentationConfig,
} from './types';

type Update = (update: ProcessingUpdate) => void;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
export async function fingerprint(blob: Blob) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export async function importRecording(
  blob: Blob,
  metadata: Pick<
    EchoSession,
    | 'id'
    | 'name'
    | 'selectedHand'
    | 'mirrored'
    | 'demonstration'
    | 'createdAt'
    | 'comparisonGroup'
  >,
  update: Update = () => {},
  signal?: AbortSignal,
): Promise<EchoSession> {
  if (blob.size > 250 * 1024 * 1024)
    throw Error('Choose a video smaller than 250 MB.');
  const loaded = await loadVideo(blob, signal);
  let detector: HandLandmarker | undefined;
  try {
    checkAbort(signal);
    update({
      stage: 'Loading hand tracker',
      completed: 0,
      total: 1,
      sessionName: metadata.name,
    });
    const files = await FilesetResolver.forVisionTasks(
      `${import.meta.env.BASE_URL}mediapipe`,
    );
    checkAbort(signal);
    detector = await HandLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });
    const { video } = loaded,
      duration = video.duration * 1000;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = Math.round((640 * video.videoHeight) / video.videoWidth);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const count = Math.ceil(duration / 83.333),
      frames: EchoFrame[] = [];
    for (let i = 0; i <= count; i++) {
      checkAbort(signal);
      const tMs = Math.min(duration - 2, (i * duration) / count);
      await seekVideo(video, tMs / 1000, signal);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const result = detector.detectForVideo(canvas, tMs);
      const image =
        result.landmarks[0]?.map((p) => ({ x: p.x, y: p.y, z: p.z })) ?? [];
      const world =
        result.worldLandmarks[0]?.map((p) => ({ x: p.x, y: p.y, z: p.z })) ??
        [];
      const angles = pairAngles(normalizeHand(world));
      const valid =
        result.landmarks.length === 1 &&
        image.length === 21 &&
        angles.length === 4 &&
        image.every(
          (p) => p.x > 0.005 && p.x < 0.995 && p.y > 0.005 && p.y < 0.995,
        );
      frames.push({
        tMs,
        image: valid ? image : [],
        world: valid ? world : [],
        valid,
        spread: valid ? angles.slice(1).reduce((s, v) => s + v, 0) / 3 : null,
      });
      update({
        stage: 'Reading recorded movement',
        completed: i + 1,
        total: count + 1,
        sessionName: metadata.name,
      });
      await tick();
    }
    const repetitions = detectRepetitions(frames);
    if (!repetitions.length) {
      const valid = frames.filter((f) => f.valid);
      if (valid.length >= 10) {
        const pose = valid[Math.floor(valid.length / 2)];
        repetitions.push({
          startMs: valid[0].tMs,
          peakMs: pose.tMs,
          endMs: valid.at(-1)!.tMs,
          valid: true,
          static: true,
          coverage: valid.length / frames.length,
          peakSpread: pose.spread!,
        });
      }
    }
    return {
      ...metadata,
      video: blob,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      videoDurationMs: duration,
      landmarkOffsetMs: 0,
      exerciseId: 'finger-spread-close',
      sourceFingerprint: await fingerprint(blob),
      frames,
      repetitions,
    };
  } finally {
    detector?.close();
    loaded.release();
  }
}
export function cacheKey(
  session: EchoSession,
  repetitionIndex: number,
  config: SegmentationConfig,
) {
  const rep = session.repetitions[repetitionIndex];
  return JSON.stringify([
    session.id,
    session.sourceFingerprint,
    repetitionIndex,
    rep,
    PROCESSING_VERSION,
    config,
  ]);
}
export async function buildGhostCache(
  session: EchoSession,
  repetitionIndex: number,
  config: SegmentationConfig,
  update: Update = () => {},
  signal?: AbortSignal,
  force = false,
): Promise<GhostCache> {
  const key = cacheKey(session, repetitionIndex, config);
  if (!force) {
    const stored = await echoRepository.cache(key);
    if (stored) return stored;
  }
  const rep = session.repetitions[repetitionIndex];
  if (!rep?.valid) throw Error('Select a complete repetition first.');
  const loaded = await loadVideo(session.video, signal);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = Math.round(
      (640 * session.videoHeight) / session.videoWidth,
    );
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const frames: GhostCache['frames'] = [];
    // A fixed-camera recording supplies its own conservative background sample:
    // only pixels safely outside the first observed hand box are known backdrop.
    // Unknown pixels are alpha=0 and never used to subtract actual hand pixels.
    let background: ImageData | undefined;
    const first = session.frames.find((f) => f.valid);
    if (first) {
      await seekVideo(
        loaded.video,
        (first.tMs + session.landmarkOffsetMs) / 1000,
        signal,
      );
      ctx.drawImage(loaded.video, 0, 0, canvas.width, canvas.height);
      background = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const points = first.image.map((p) => ({
        x: p.x * canvas.width,
        y: p.y * canvas.height,
      }));
      const pad =
        Math.hypot(points[9].x - points[0].x, points[9].y - points[0].y) * 0.15;
      const left = Math.min(...points.map((p) => p.x)) - pad,
        right = Math.max(...points.map((p) => p.x)) + pad,
        top = Math.min(...points.map((p) => p.y)) - pad,
        bottom = Math.max(...points.map((p) => p.y)) + pad;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++)
          background.data[(y * canvas.width + x) * 4 + 3] =
            x >= left && x <= right && y >= top && y <= bottom ? 0 : 255;
    }
    const samples = rep.static ? 1 : config.sampleCount;
    for (let i = 0; i < samples; i++) {
      checkAbort(signal);
      const phase = rep.static ? 0.5 : i / (samples - 1),
        tMs = phaseToTime(phase, rep);
      const tracked = frameAtTime(
        session.frames,
        tMs - session.landmarkOffsetMs,
      );
      if (tracked) {
        await seekVideo(loaded.video, tMs / 1000, signal);
        ctx.drawImage(loaded.video, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let segmented = segmentHand(pixels, tracked.image, config, background);
        if (!segmented.quality.valid && segmented.quality.edgeLeak > 0.015) {
          for (const factor of [0.85, 0.7]) {
            const alternate = segmentHand(
              pixels,
              tracked.image,
              { ...config, colorTolerance: config.colorTolerance * factor },
              background,
            );
            if (alternate.quality.valid) {
              segmented = alternate;
              break;
            }
          }
        }
        const previous = frames.at(-1);
        if (
          previous &&
          previous.quality.area > 0 &&
          Math.abs(segmented.quality.area / previous.quality.area - 1) > 0.5
        ) {
          segmented.quality.valid = false;
          segmented.quality.warnings.push(
            'The hand outline changed size abruptly.',
          );
        }
        ctx.putImageData(
          new ImageData(segmented.rgba, canvas.width, canvas.height),
          0,
          0,
        );
        // Store cropped imagery instead of full video-sized textures.
        let left = canvas.width,
          top = canvas.height,
          right = 0,
          bottom = 0;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++)
            if (segmented.alpha[y * canvas.width + x]) {
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
        if (right <= left || bottom <= top) {
          left = 0;
          top = 0;
          right = 1;
          bottom = 1;
        }
        left = Math.max(0, left - 2);
        top = Math.max(0, top - 2);
        right = Math.min(canvas.width - 1, right + 2);
        bottom = Math.min(canvas.height - 1, bottom + 2);
        const crop = document.createElement('canvas');
        crop.width = right - left + 1;
        crop.height = bottom - top + 1;
        crop
          .getContext('2d')!
          .drawImage(
            canvas,
            left,
            top,
            crop.width,
            crop.height,
            0,
            0,
            crop.width,
            crop.height,
          );
        const anchors = palmAnchors(
          tracked.image,
          canvas.width,
          canvas.height,
        ).map((p) => ({ x: p.x - left, y: p.y - top })) as ReturnType<
          typeof palmAnchors
        >;
        frames.push({
          phase,
          tMs,
          image: await canvasBlob(crop),
          width: crop.width,
          height: crop.height,
          anchors,
          quality: segmented.quality,
        });
      }
      update({
        stage: 'Extracting real hand pixels',
        completed: i + 1,
        total: samples,
        sessionName: session.name,
      });
      await tick();
    }
    const cache: GhostCache = {
      key,
      sessionId: session.id,
      repetitionIndex,
      version: PROCESSING_VERSION,
      sourceFingerprint: session.sourceFingerprint,
      config,
      frames,
    };
    checkAbort(signal);
    await echoRepository.saveCache(cache);
    return cache;
  } finally {
    loaded.release();
  }
}
