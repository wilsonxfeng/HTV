import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { BODY_DEMO_CLIPS, RETIRED_BODY_DEMO_IDS } from './bodyDemoCatalog';
import { detectBodyRepetitions } from './repetitionDetection';
import { bodySignal } from '../body-tracking/poseMetrics';
import { poseMotionSchema, createSchema } from '../../../server/validation';
import { bodySessionMetadata } from '../clinical-data/echoAdapter';
import type { BodyRecording } from '../body-tracking/bodyRecordingStore';
import type { EchoSession, GhostCache } from '../movement-echoes/types';
import { phaseToTime, timeToPhase } from '../movement-echoes/geometry';
const root = new URL('../../../public/demo recordings/', import.meta.url);
it('ships both repetitions and source-matched masks for each replacement leg and new curl recording', async () => {
  const prepared = JSON.parse(await readFile(new URL('body-prepared/manifest.json', root), 'utf8')) as {
    recordings: Omit<BodyRecording,'video'>[]; sessions: Omit<EchoSession,'video'>[]; caches: (Omit<GhostCache,'frames'> & { frames: { file: string; quality: { valid: boolean } }[] })[];
  };
  expect(prepared.sessions).toHaveLength(6);
  for (const clip of BODY_DEMO_CLIPS) {
    const bytes = await readFile(new URL(clip.file, root));
    const record = prepared.recordings.find(r => r.motion.id === clip.id)!;
    const session = prepared.sessions.find(s => s.id === clip.id)!;
    expect(record.metadata.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(poseMotionSchema.safeParse(record.motion).success).toBe(true);
    expect(createSchema.safeParse(bodySessionMetadata(record.motion, record.metadata, '00000000-0000-4000-8000-000000000001', true)).success).toBe(true);
    expect(session.repetitions).toHaveLength(2);
    const measured = detectBodyRepetitions(bodySignal(record.motion), 8, true);
    expect(measured).toHaveLength(2);
    for (const [i, rep] of session.repetitions.entries()) {
      expect(rep).toMatchObject({ startMs: measured[i].startMs, peakMs: measured[i].peakMs, endMs: measured[i].endMs });
      expect(rep.peakSpread).toBeCloseTo(measured[i].peakSpread, 6);
      expect(rep.partial).toBe(measured[i].partial);
      rep.phaseMap!.forEach((point, j) => expect(point.phase).toBeCloseTo(measured[i].phaseMap![j].phase, 8));
    }
    for (const [i, rep] of session.repetitions.entries()) {
      expect(phaseToTime(.5, rep)).toBe(rep.peakMs);
      expect(timeToPhase(rep.peakMs, rep)).toBeCloseTo(.5);
      expect(rep.endMs).toBeLessThanOrEqual(session.videoDurationMs);
      const cache = prepared.caches.find(c => c.sessionId === clip.id && c.repetitionIndex === i)!;
      expect(cache.sourceFingerprint).toBe(record.metadata.sha256);
      expect(cache.frames.length).toBe(32);
      expect(cache.frames.filter(f => f.quality.valid).length).toBeGreaterThanOrEqual(28);
      await readFile(new URL(`body-prepared/${cache.frames[16].file}`, root));
    }
  }
  expect(prepared.sessions.some(s => RETIRED_BODY_DEMO_IDS.includes(s.id))).toBe(false);
});
