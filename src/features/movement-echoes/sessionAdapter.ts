import type { MotionSession } from '../../lib/types';
import { pairAngles } from '../../lib/geometry';
import { detectRepetitions } from './geometry';
import type { EchoFrame, EchoSession } from './types';
import { fingerprint } from './processing';

/** Old sessions contain landmarks only. A real, corresponding video is mandatory.
 * offsetMs is video time minus landmark time, measured at recording start.
 * This adapter never fabricates video, assumes the legacy tempo, or awards a garden reward.
 */
export async function adaptMotionSession(
  session: MotionSession,
  video: Blob,
  metadata: {
    width: number;
    height: number;
    durationMs: number;
    offsetMs: number;
    mirrored: boolean;
  },
): Promise<EchoSession> {
  const frames: EchoFrame[] = session.frames.map((f) => {
    const angles = pairAngles(f.landmarks);
    return {
      tMs: f.t * 1000,
      image: f.imageLandmarks ?? [],
      world: f.worldLandmarks ?? [],
      valid:
        f.tracking && f.imageLandmarks?.length === 21 && angles.length === 4,
      spread:
        angles.length === 4
          ? angles.slice(1).reduce((s, v) => s + v, 0) / 3
          : null,
    };
  });
  const repetitions = detectRepetitions(frames).map((r) => ({
    ...r,
    startMs: r.startMs + metadata.offsetMs,
    peakMs: r.peakMs + metadata.offsetMs,
    endMs: r.endMs + metadata.offsetMs,
  }));
  return {
    id: session.id,
    name: new Date(session.createdAt).toLocaleString(),
    createdAt: session.createdAt,
    exerciseId: session.exerciseId ?? 'finger-spread-close',
    selectedHand: session.hand,
    demonstration: session.source === 'demo',
    mirrored: metadata.mirrored,
    video,
    videoWidth: metadata.width,
    videoHeight: metadata.height,
    videoDurationMs: metadata.durationMs,
    landmarkOffsetMs: metadata.offsetMs,
    frames,
    repetitions,
    sourceFingerprint: await fingerprint(video),
  };
}
