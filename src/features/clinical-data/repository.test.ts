import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createOutbox } from './outbox';
import { fetchEchoSessions, toEchoSession } from './echoAdapter';
import type { CreateSession, SessionDetail, SessionRepository } from './contracts';
import { createDemoSession } from '../../lib/demo';

function fixture(id = crypto.randomUUID()): SessionDetail {
  const motion = { ...createDemoSession(), id };
  return { id, patientId: 'patient-a', exerciseId: 'finger-spread-close', hand: 'Right', startedAt: motion.createdAt, demonstration: true, videoKind: 'synthetic', video: { mimeType: 'video/webm', sizeBytes: 10, sha256: 'a'.repeat(64), width: 640, height: 480, durationMs: 24000, landmarkOffsetMs: -12, mirrored: false }, status: 'complete', metrics: null, repetitions: [{ startMs: 100, peakMs: 900, endMs: 1800, coverage: 1, peakSpread: 15, valid: true }], report: null, motion };
}
describe('durable recording repository', () => {
  it('preserves video and recording after failed upload, retries the same UUID, and survives repository recreation', async () => {
    const name = `outbox-${crypto.randomUUID()}`, outbox = createOutbox(name), detail = fixture(), blob = new Blob(['saved-video']);
    const metadata: CreateSession = detail;
    await outbox.save(metadata, detail.motion, blob);
    const upload = vi.fn().mockRejectedValueOnce(Error('Offline')).mockResolvedValue(detail);
    const repository = { upload } as unknown as SessionRepository;
    const failed = await outbox.sync(detail.id, repository);
    expect(failed.state).toBe('error'); expect(failed.video.size).toBe(blob.size);
    const recreated = createOutbox(name);
    expect((await recreated.get(detail.id))?.motion.frames.length).toBe(detail.motion.frames.length);
    expect((await recreated.sync(detail.id, repository)).state).toBe('synced');
    expect(upload.mock.calls.map(args => args[0].id)).toEqual([detail.id,detail.id]);
    await recreated.sync(detail.id, repository); expect(upload).toHaveBeenCalledTimes(2);
  });
  it('keeps the actual video clock offset and rejects incompatible patient/hand comparisons', async () => {
    const a = fixture(), b = fixture();
    const blob = new Blob(['video']);
    const echo = toEchoSession(a, blob);
    expect(echo.video).toBe(blob); expect(echo.landmarkOffsetMs).toBe(-12);
    expect(echo.repetitions[0].peakMs).toBe(900);
    expect(echo.frames[1].tMs).toBe(a.motion.frames[1].t*1000);
    const repository = { detail: vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce({ ...b, hand: 'Left' }), video: vi.fn() } as unknown as SessionRepository;
    await expect(fetchEchoSessions(repository, [a.id,b.id])).rejects.toThrow('same patient');
    expect(repository.video).not.toHaveBeenCalled();
  });
});
