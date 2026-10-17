import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { localDatabase, migrate } from './db';
import { LocalVideoStore } from './videos';
import { ClinicalRepository } from './repository';
import { buildApi } from './app';
import { issueToken } from './auth';
import type { Config } from './config';
import type { CreateSession, SessionDetail } from '../src/features/clinical-data/contracts';
import { createDemoSession } from '../src/lib/demo';
import { motionSchema } from './validation';

const db = localDatabase();
let directory: string, app: Awaited<ReturnType<typeof buildApi>>, repository: ClinicalRepository;
const patientId = randomUUID(), otherId = randomUUID();
const secret = 'a-test-secret-with-more-than-thirty-two-characters';
let patientToken: string, clinicianToken: string, otherToken: string;
const bytes = Buffer.from([0x1a,0x45,0xdf,0xa3,...new Array(100).fill(0)]);
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
function fixture() {
  const base = createDemoSession();
  const motion = { ...base, id: randomUUID(), createdAt: '2026-10-17T10:00:00.000Z', exerciseId: 'finger-spread-close' as const, source: 'camera' as const, completed: true, frames: base.frames.filter((_, i) => i % 2 === 0).map(frame => ({ ...frame, worldLandmarks: frame.landmarks, imageLandmarks: frame.landmarks.map(p => ({ x: .5+p.x*.14, y: .85-p.y*.25, z: p.z*.14 })) })) };
  const metadata: CreateSession = { id: motion.id, patientId, exerciseId: 'finger-spread-close', hand: 'Right', startedAt: motion.createdAt, demonstration: false, videoKind: 'camera', video: { mimeType: 'video/webm', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width: 640, height: 480, durationMs: 24000, landmarkOffsetMs: 0, mirrored: false } };
  return { motion: motionSchema.parse(motion), metadata };
}
async function upload(metadata: CreateSession, video = bytes) {
  const created = await app.inject({ method: 'POST', url: '/api/sessions', headers: headers(patientToken), payload: metadata });
  expect(created.statusCode).toBe(200);
  const signed = await app.inject({ method: 'POST', url: `/api/sessions/${metadata.id}/upload-url`, headers: headers(patientToken) });
  expect(signed.statusCode).toBe(200);
  const transfer = signed.json();
  return app.inject({ method: 'PUT', url: new URL(transfer.url).pathname, headers: transfer.headers, payload: video });
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'remotion-api-test-'));
  await migrate(db, false);
  await db.query('INSERT INTO patients (id,display_name) VALUES ($1,$2),($3,$4)', [patientId, 'Patient A', otherId, 'Patient B']);
  patientToken = await issueToken(secret, { sub: 'patient-a', role: 'patient', patientIds: [patientId] });
  clinicianToken = await issueToken(secret, { sub: 'clinician-a', role: 'clinician', patientIds: [patientId] });
  otherToken = await issueToken(secret, { sub: 'patient-b', role: 'patient', patientIds: [otherId] });
  repository = new ClinicalRepository(db, new LocalVideoStore(directory, secret, 'http://localhost:3001'));
  app = await buildApi({ demo: true, secret, origin: 'http://localhost:5173' } as Config, repository);
}, 30000);
afterAll(async () => { await app?.close(); await db.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe('authenticated upload pipeline against PostgreSQL', () => {
  it('denies missing, forged, cross-patient and clinician-write access', async () => {
    expect((await app.inject('/api/patients')).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/patients', headers: headers('forged') })).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/patients/${patientId}/sessions`, headers: headers(otherToken) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/sessions', headers: headers(clinicianToken), payload: fixture().metadata })).statusCode).toBe(403);
    const patients = await app.inject({ url: '/api/patients', headers: headers(clinicianToken) });
    expect(patients.json()).toHaveLength(1);
    expect(patients.json()[0].id).toBe(patientId);
    expect(patients.json()[0].adherence.percent).toBeNull();
  });
  it('requires the actual uploaded video and rejects mismatched bytes', async () => {
    const { metadata, motion } = fixture();
    await app.inject({ method: 'POST', url: '/api/sessions', headers: headers(patientToken), payload: metadata });
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${metadata.id}/complete`, headers: headers(patientToken), payload: { motion } })).statusCode).toBe(409);
    expect((await upload(metadata, Buffer.from('wrong-video'))).statusCode).toBe(400);
  });
  it('stores and retrieves video, time-aligned frames, deterministic metrics and cycles; completion is idempotent', async () => {
    const { metadata, motion } = fixture();
    expect((await upload(metadata)).statusCode).toBe(204);
    const finish = () => app.inject({ method: 'POST', url: `/api/sessions/${metadata.id}/complete`, headers: headers(patientToken), payload: { motion } });
    const first = await finish();
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().status).toBe('complete');
    expect(first.json().repetitions.length).toBe(3);
    expect((await finish()).json()).toEqual(first.json());
    const detail = (await app.inject({ url: `/api/sessions/${metadata.id}`, headers: headers(clinicianToken) })).json<SessionDetail>();
    expect(detail.motion.frames).toEqual(motion.frames);
    expect(detail.motion.duration).toBe(motion.duration);
    expect(detail.metrics?.validFrames).toBe(motion.frames.length);
    const count = await db.query<{ n: number }>('SELECT count(*)::integer AS n FROM hand_frames WHERE session_id=$1', [metadata.id]);
    expect(count.rows[0].n).toBe(motion.frames.length);
    const clock = await db.query<{ ms: number }>('SELECT extract(epoch from (captured_at-$2::timestamptz))*1000 AS ms FROM hand_frames WHERE session_id=$1 ORDER BY t_ms DESC LIMIT 1', [metadata.id, metadata.startedAt]);
    expect(Number(clock.rows[0].ms)).toBeCloseTo(motion.frames.at(-1)!.t*1000, 3);
    const link = (await app.inject({ url: `/api/sessions/${metadata.id}/video-url`, headers: headers(clinicianToken) })).json();
    const playback = await app.inject({ url: new URL(link.url).pathname });
    expect(playback.rawPayload).toEqual(bytes);
    const range = await app.inject({ url: new URL(link.url).pathname, headers: { range: 'bytes=3-8' } });
    expect(range.statusCode).toBe(206); expect(range.rawPayload).toEqual(bytes.subarray(3,9));
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${metadata.id}/upload-url`, headers: headers(patientToken) })).statusCode).toBe(409);
    expect((await app.inject({ url: `/api/sessions/${metadata.id}`, headers: headers(otherToken) })).statusCode).toBe(403);
    const progress = await app.inject({ url: `/api/patients/${patientId}/progress`, headers: headers(clinicianToken) });
    expect(progress.statusCode, progress.body).toBe(200);
    expect(progress.json().some((p: { id: string; angle: number }) => p.id === metadata.id && p.angle > 0)).toBe(true);
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${metadata.id}/report`, headers: headers(clinicianToken) })).statusCode).toBe(503);
    const conflict = await app.inject({ method: 'POST', url: `/api/sessions/${metadata.id}/complete`, headers: headers(patientToken), payload: { motion: { ...motion, completed: false } } });
    expect(conflict.statusCode).toBe(409);
  });
  it('rejects stale or mismatched clocks and invalid tracking data', async () => {
    const { metadata, motion } = fixture();
    await upload(metadata);
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${metadata.id}/complete`, headers: headers(patientToken), payload: { motion: { ...motion, createdAt: '2026-10-16T10:00:00.000Z' } } })).statusCode).toBe(400);
    const bad = { ...motion, frames: [{ ...motion.frames[0], imageLandmarks: [] }, ...motion.frames.slice(1)] };
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${metadata.id}/complete`, headers: headers(patientToken), payload: { motion: bad } })).statusCode).toBe(400);
    expect((await repository.raw(metadata.id)).status).toBe('pending');
  });
});
