import { DEMO_CLIPS } from './demoClips';
import { loadPreparedDemo } from './preparedDemo';
import { importRecording } from './processing';
import { echoRepository } from './repository';
import type { EchoSession, ProcessingUpdate } from './types';

/** Loads only the supplied hand clips, even when body recordings are already on this device. */
export async function loadHandDemo(update: (value: ProcessingUpdate) => void, signal?: AbortSignal): Promise<EchoSession[]> {
  const sessions: EchoSession[] = [];
  for (const clip of DEMO_CLIPS) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    update({ stage: 'Loading finger demo', completed: sessions.length, total: DEMO_CLIPS.length, sessionName: clip.name });
    const response = await fetch(clip.url, { signal });
    if (!response.ok) throw Error(`${clip.name} was not found in public/demo recordings.`);
    const blob = await response.blob();
    const prepared = await loadPreparedDemo(clip.id, blob, update, signal);
    const session = prepared?.session ?? await importRecording(blob, {
      id: clip.id, name: clip.name, selectedHand: 'Unconfirmed', mirrored: false,
      demonstration: true, comparisonGroup: 'supplied-same-hand-demo', createdAt: new Date().toISOString(),
    }, update, signal);
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    await echoRepository.save(session);
    if (prepared) await echoRepository.saveCache(prepared.cache);
    sessions.push(session);
  }
  return sessions;
}
