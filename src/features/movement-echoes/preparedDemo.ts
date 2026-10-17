import { cacheKey, fingerprint } from './processing';
import { PROCESSING_VERSION } from './types';
import type {
  EchoSession,
  GhostCache,
  GhostFrame,
  ProcessingUpdate,
} from './types';
import { checkAbort } from './video';

interface PreparedEntry {
  session: Omit<EchoSession, 'video'>;
  cache: Omit<GhostCache, 'frames'> & {
    frames: (Omit<GhostFrame, 'image'> & { imagePath: string })[];
  };
}
/** Reviewed real-video cache bundle. Hash/version mismatch falls back to local inference. */
export async function loadPreparedDemo(
  id: string,
  video: Blob,
  update: (u: ProcessingUpdate) => void,
  signal?: AbortSignal,
): Promise<{ session: EchoSession; cache: GhostCache } | null> {
  const base = `${import.meta.env.BASE_URL}demo%20recordings/prepared/`;
  const response = await fetch(`${base}manifest.json`, { signal });
  if (!response.ok) return null;
  let manifest: { format: string; version: string; entries: PreparedEntry[] };
  try {
    manifest = await response.json();
  } catch {
    checkAbort(signal);
    return null;
  }
  if (
    manifest.format !== 'remotion-echo-demo-v1' ||
    manifest.version !== PROCESSING_VERSION ||
    !Array.isArray(manifest.entries)
  )
    return null;
  const entry = manifest.entries.find((v) => v.session.id === id);
  if (!entry || !entry.session.demonstration) return null;
  if (entry.session.sourceFingerprint !== (await fingerprint(video)))
    return null;
  const session: EchoSession = { ...entry.session, video };
  if (
    entry.cache.version !== PROCESSING_VERSION ||
    entry.cache.key !==
      cacheKey(session, entry.cache.repetitionIndex, entry.cache.config)
  )
    return null;
  const frames: GhostFrame[] = [];
  for (const item of entry.cache.frames) {
    checkAbort(signal);
    if (!/^frames\/[a-z0-9-]+\.webp$/.test(item.imagePath)) return null;
    const imageResponse = await fetch(base + item.imagePath, { signal });
    if (!imageResponse.ok) return null;
    const { imagePath, ...frame } = item;
    void imagePath;
    frames.push({ ...frame, image: await imageResponse.blob() });
    update({
      stage: 'Loading prepared hand outlines',
      completed: frames.length,
      total: entry.cache.frames.length,
      sessionName: session.name,
    });
  }
  return { session, cache: { ...entry.cache, frames } };
}
