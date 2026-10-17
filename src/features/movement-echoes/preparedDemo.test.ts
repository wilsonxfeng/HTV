import { afterEach, expect, it, vi } from 'vitest';
import { loadPreparedDemo } from './preparedDemo';
import { cacheKey, fingerprint } from './processing';
import { DEFAULT_CONFIG, PROCESSING_VERSION } from './types';
import type { EchoSession } from './types';

afterEach(() => vi.unstubAllGlobals());
it('falls back to real processing when a dev server returns HTML for a missing bundle', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<html>app fallback</html>')),
  );
  expect(
    await loadPreparedDemo('demo', new Blob(['original']), () => {}),
  ).toBeNull();
});
it('rejects prepared data when its algorithm version has changed', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        format: 'remotion-echo-demo-v1',
        version: 'stale',
        entries: [],
      }),
    ),
  );
  expect(
    await loadPreparedDemo('demo', new Blob(['original']), () => {}),
  ).toBeNull();
});
it('uses prepared pixels only when the source video hash and cache identity match', async () => {
  const video = new Blob(['original fixture video']);
  const session: EchoSession = {
    id: 'demo',
    name: 'Synthetic unit fixture',
    createdAt: '2026-10-17T12:00:00Z',
    exerciseId: 'finger-spread-close',
    selectedHand: 'Unconfirmed',
    mirrored: false,
    demonstration: true,
    video,
    videoWidth: 640,
    videoHeight: 480,
    videoDurationMs: 2000,
    landmarkOffsetMs: 0,
    frames: [],
    repetitions: [
      {
        startMs: 0,
        peakMs: 1000,
        endMs: 2000,
        valid: true,
        coverage: 1,
        peakSpread: 10,
      },
    ],
    sourceFingerprint: await fingerprint(video),
  };
  const { video: ignored, ...metadata } = session;
  void ignored;
  const cache = {
    key: cacheKey(session, 0, DEFAULT_CONFIG),
    sessionId: 'demo',
    version: PROCESSING_VERSION,
    repetitionIndex: 0,
    config: DEFAULT_CONFIG,
    sourceFingerprint: session.sourceFingerprint,
    frames: [],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        format: 'remotion-echo-demo-v1',
        version: PROCESSING_VERSION,
        entries: [{ session: metadata, cache }],
      }),
    ),
  );
  expect((await loadPreparedDemo('demo', video, () => {}))?.session.video).toBe(
    video,
  );
  expect(
    await loadPreparedDemo(
      'demo',
      new Blob(['changed fixture video']),
      () => {},
    ),
  ).toBeNull();
});
