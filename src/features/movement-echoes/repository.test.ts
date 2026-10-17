import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { echoRepository } from './repository';
import { cacheKey } from './processing';
import { DEFAULT_CONFIG, PROCESSING_VERSION } from './types';
import type { EchoSession, GhostCache } from './types';

it('persists original video unchanged and atomically deletes its derived caches', async () => {
  const session: EchoSession = {
    id: 'storage-fixture',
    name: 'synthetic test',
    createdAt: '2026-10-17T12:00:00Z',
    exerciseId: 'finger-spread-close',
    selectedHand: 'Right',
    mirrored: false,
    demonstration: true,
    video: new Blob(['original-video-bytes']),
    videoWidth: 640,
    videoHeight: 480,
    videoDurationMs: 4000,
    landmarkOffsetMs: 0,
    frames: [],
    repetitions: [
      {
        startMs: 0,
        peakMs: 2000,
        endMs: 4000,
        valid: true,
        coverage: 1,
        peakSpread: 15,
      },
    ],
    sourceFingerprint: 'fixture-hash',
  };
  const key = cacheKey(session, 0, DEFAULT_CONFIG);
  const cache: GhostCache = {
    key,
    sessionId: session.id,
    repetitionIndex: 0,
    version: PROCESSING_VERSION,
    config: DEFAULT_CONFIG,
    sourceFingerprint: session.sourceFingerprint,
    frames: [],
  };
  await echoRepository.save(session);
  await echoRepository.saveCache(cache);
  expect(
    await (await echoRepository.list())
      .find((s) => s.id === session.id)!
      .video.text(),
  ).toBe('original-video-bytes');
  expect((await echoRepository.cache(key))?.key).toBe(key);
  expect(
    cacheKey(session, 0, { ...DEFAULT_CONFIG, colorTolerance: 1.2 }),
  ).not.toBe(key);
  expect(
    cacheKey(
      { ...session, sourceFingerprint: 'replacement' },
      0,
      DEFAULT_CONFIG,
    ),
  ).not.toBe(key);
  await echoRepository.delete(session.id);
  expect(await echoRepository.cache(key)).toBeUndefined();
  expect((await echoRepository.list()).some((s) => s.id === session.id)).toBe(
    false,
  );
});
