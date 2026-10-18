/** Development-only entry point; run from the local app with the artifact receiver. */
import { BODY_DEMO_CLIPS } from './bodyDemoCatalog';
import { importBodyRecording } from '../body-tracking/importBodyRecording';
import { toBodyEchoSession } from '../body-echoes/BodyEchoAdapter';
import { buildBodyGhostCache } from '../body-echoes/bodyGhostCache';
import { DEFAULT_CONFIG } from '../movement-echoes/types';
import { videoHash } from '../clinical-data/capture';
import type { BodyRecording } from '../body-tracking/bodyRecordingStore';
import { poseValue } from '../body-tracking/poseMetrics';
export async function prepareBodyDemos(update: (value: unknown) => void, masks = false) {
  const save = async (name: string, data: Blob | string) => {
    const r = await fetch(`http://127.0.0.1:8788/${name}`, { method: 'POST', body: data });
    if (!r.ok) throw Error(`Could not save ${name}`);
  };
  const recordings = [], sessions = [], caches = [];
  for (const [i, clip] of BODY_DEMO_CLIPS.entries()) {
    const r = await fetch(`/demo%20recordings/${encodeURIComponent(clip.file)}`);
    if (!r.ok) throw Error(`Missing ${clip.file}`);
    const video = new Blob([await r.blob()], { type: 'video/mp4' });
    const saved = await fetch(`http://127.0.0.1:8788/analysis-${i}.json`).then(r => r.ok ? r.json() : null) as { recording: Omit<BodyRecording, 'video'> } | null;
    const record = saved?.recording?.metadata.sha256 === await videoHash(video) ? { ...saved.recording, video } : await importBodyRecording(video, { ...clip, demonstration: true }, update);
    record.metadata.mimeType = 'video/mp4';
    record.motion.source = 'camera';
    record.motion.cameraView = clip.cameraView;
    record.motion.repetitionTarget = 2;
    const session = toBodyEchoSession(record.motion, video, record.metadata, true);
    session.name = clip.name;
    record.motion.completed = session.repetitions.filter(r => !r.partial).length === 2;
    const { video: _video, ...stored } = record;
    const { video: _blob, ...normalized } = session;
    recordings.push(stored); sessions.push(normalized);
    const alternate = record.motion.frames.filter(f => f.tracking).map(f => poseValue(f.worldLandmarks!, clip.exerciseId, 'Right')).filter(v => v !== null);
    update({ clip: clip.file, repetitions: session.repetitions, tracked: record.motion.frames.filter(f => f.tracking).length, total: record.motion.frames.length, alternateRange: [Math.min(...alternate), Math.max(...alternate)] });
    await save(`analysis-${i}.json`, JSON.stringify({ recording: stored, session: normalized }));
    if (masks) for (let rep = 0; rep < session.repetitions.length; rep++) {
      const cache = await buildBodyGhostCache(session, rep, DEFAULT_CONFIG, update, undefined, true, false);
      const frames = [];
      for (const [index, frame] of cache.frames.entries()) {
        const file = `body-${i}-rep-${rep}-${index}.webp`;
        await save(file, frame.image);
        const { image: _image, ...metadata } = frame;
        frames.push({ ...metadata, file });
      }
      caches.push({ ...cache, frames });
    }
  }
  await save('manifest.json', JSON.stringify({ recordings, sessions, caches }));
  return sessions.map(s => ({ name: s.name, repetitions: s.repetitions }));
}
