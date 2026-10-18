import type { BodyRecording } from '../body-tracking/bodyRecordingStore';
import { bodyRecordingStore } from '../body-tracking/bodyRecordingStore';
import { importBodyRecording } from '../body-tracking/importBodyRecording';
import { toBodyEchoSession } from '../body-echoes/BodyEchoAdapter';
import { echoRepository } from '../movement-echoes/repository';
import type { EchoSession, GhostCache, GhostFrame, ProcessingUpdate } from '../movement-echoes/types';
import { videoHash } from '../clinical-data/capture';
import { BODY_ANALYSIS_VERSION, BODY_SEGMENTATION_VERSION } from './exerciseRegistry';
import { BODY_DEMO_CLIPS, RETIRED_BODY_DEMO_IDS } from './bodyDemoCatalog';

type Prepared = { recordings: Omit<BodyRecording, 'video'>[]; sessions: Omit<EchoSession, 'video'>[];
  caches: (Omit<GhostCache, 'frames'> & { frames: (Omit<GhostFrame, 'image'> & { file: string })[] })[] };
/** Prepared pixels are accepted only for matching source hashes and processing versions. */
export async function loadBodyDemos(update: (u: ProcessingUpdate) => void, signal?: AbortSignal, exerciseId?: string): Promise<EchoSession[]> {
  const base = `${import.meta.env.BASE_URL}demo%20recordings/`;
  const saved = await echoRepository.list(), sessions: EchoSession[] = [];
  const response = await fetch(`${base}body-prepared/manifest.json`, { signal });
  if (!response.ok) throw Error('Prepared movement recordings are unavailable.');
  const prepared = await response.json() as Prepared;
  const clips = BODY_DEMO_CLIPS.filter(c => !exerciseId || c.exerciseId === exerciseId);
  for (const [i, clip] of clips.entries()) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    update({ stage: 'Loading recordings', completed: i, total: clips.length, sessionName: clip.name });
    const record = prepared.recordings.find(r => r.motion.id === clip.id);
    const normalized = prepared.sessions.find(s => s.id === clip.id);
    const existing = saved.find(s => s.id === clip.id && s.sourceFingerprint === record?.metadata.sha256 && s.analysisVersion === BODY_ANALYSIS_VERSION);
    if (existing) { sessions.push(existing); continue; }
    const source = await fetch(`${base}${encodeURIComponent(clip.file)}`, { signal });
    if (!source.ok) throw Error(`${clip.name} is unavailable.`);
    const video = new Blob([await source.blob()], { type: 'video/mp4' }), hash = await videoHash(video);
    let session: EchoSession;
    if (record?.metadata.sha256 === hash && normalized?.sourceFingerprint === hash && normalized.analysisVersion === BODY_ANALYSIS_VERSION) {
      session = { ...normalized, video };
      for (const cache of prepared.caches.filter(c => c.sessionId === clip.id && c.sourceFingerprint === hash && c.version === BODY_SEGMENTATION_VERSION)) {
        const frames = await Promise.all(cache.frames.map(async ({ file, ...frame }) => {
          if (!/^[a-z0-9-]+\.webp$/.test(file)) throw Error('Invalid prepared outline.');
          const r = await fetch(`${base}body-prepared/${file}`, { signal });
          if (!r.ok) throw Error('A prepared person outline is missing.');
          return { ...frame, image: await r.blob() };
        }));
        await echoRepository.saveCache({ ...cache, frames });
      }
      await bodyRecordingStore.save({ ...record, video });
    } else {
      const measured = await importBodyRecording(video, { ...clip, demonstration: true }, update, signal);
      measured.motion.source = 'camera';
      measured.motion.cameraView = clip.cameraView;
      measured.motion.repetitionTarget = 2;
      session = toBodyEchoSession(measured.motion, video, measured.metadata, true);
      session.name = clip.name;
      await bodyRecordingStore.save(measured);
    }
    await echoRepository.save(session); sessions.push(session);
  }
  // Remove only the superseded supplied demo IDs, after their replacements have loaded successfully.
  if (!exerciseId || exerciseId === 'seated-knee-extension') for (const id of RETIRED_BODY_DEMO_IDS) {
    await echoRepository.delete(id); await bodyRecordingStore.remove(id);
  }
  return sessions;
}
export const loadKneeDemo = (update: (u: ProcessingUpdate) => void, signal?: AbortSignal) => loadBodyDemos(update, signal, 'seated-knee-extension');
export const loadBicepDemo = (update: (u: ProcessingUpdate) => void, signal?: AbortSignal) => loadBodyDemos(update, signal, 'unweighted-bicep-curl');
