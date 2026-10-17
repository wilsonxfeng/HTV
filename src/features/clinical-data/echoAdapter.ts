import { pairAngles } from '../../lib/geometry';
import { compatible } from '../movement-echoes/geometry';
import type { EchoSession } from '../movement-echoes/types';
import type { SessionDetail, SessionRepository } from './contracts';

export function toEchoSession(detail: SessionDetail, video: Blob): EchoSession {
  return {
    id: detail.id, name: new Date(detail.startedAt).toLocaleString(), createdAt: detail.startedAt,
    exerciseId: detail.exerciseId, selectedHand: detail.hand, mirrored: detail.video.mirrored,
    demonstration: detail.demonstration, video, videoWidth: detail.video.width, videoHeight: detail.video.height,
    videoDurationMs: detail.video.durationMs, landmarkOffsetMs: detail.video.landmarkOffsetMs,
    sourceFingerprint: detail.video.sha256,
    repetitions: detail.repetitions,
    frames: detail.motion.frames.map(frame => {
      const angles = frame.tracking ? pairAngles(frame.landmarks) : [];
      return { tMs: frame.t * 1000, image: frame.imageLandmarks ?? [], world: frame.worldLandmarks ?? [], spread: angles.length === 4 ? angles.slice(1).reduce((a, b) => a + b, 0) / 3 : null, valid: frame.tracking && angles.length === 4 && frame.imageLandmarks?.length === 21 };
    }),
  };
}

export async function fetchEchoSessions(repository: SessionRepository, ids: string[], signal?: AbortSignal): Promise<EchoSession[]> {
  if (ids.length < 2 || ids.length > 4 || new Set(ids).size !== ids.length) throw Error('Choose 2–4 different recordings.');
  const details = await Promise.all(ids.map(id => repository.detail(id, signal)));
  const focus = details[0];
  if (details.some(detail => detail.videoKind !== focus.videoKind)) throw Error('Compare camera recordings together or synthetic fixtures together.');
  const descriptor = (detail: SessionDetail) => ({ exerciseId: detail.exerciseId, selectedHand: detail.hand, mirrored: detail.video.mirrored });
  if (details.some(detail => detail.patientId !== focus.patientId || !compatible(descriptor(focus), descriptor(detail)) || !detail.repetitions.some(rep => rep.valid))) throw Error('Choose recordings of the same patient, exercise, hand and orientation with detected cycles.');
  return Promise.all(details.map(async detail => toEchoSession(detail, await repository.video(detail.id, signal))));
}
