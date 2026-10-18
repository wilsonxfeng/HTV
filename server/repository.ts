import { bodySignal } from '../src/features/body-tracking/poseMetrics';
import { detectBodyRepetitions } from '../src/features/body-exercises/repetitionDetection';
import { getExercise } from '../src/features/body-exercises/exerciseRegistry';
import { createHash, randomUUID } from 'node:crypto';
import type { Database } from './db';
import type { VideoStore } from './videos';
import { HttpError } from './validation';
import { analyzeSession } from '../src/lib/analysis';
import { pairAngles } from '../src/lib/geometry';
import { detectRepetitions } from '../src/features/movement-echoes/geometry';
import type { Repetition } from '../src/features/movement-echoes/types';
import type { MotionSession, SessionAnalysis } from '../src/lib/types';
import type { CreateSession, GeneratedReport, Patient, PatientOverview, ProgressPoint, SessionDetail, SessionRecord } from '../src/features/clinical-data/contracts';

type Row = { metadata: CreateSession; status: SessionRecord['status']; video_key: string | null; upload_key: string | null; completion_hash: string | null; calibration: { calibration: MotionSession['calibration']; cycleDuration: number; duration: number; source: MotionSession['source']; repetitionTarget?:number } | null; completed: boolean; metrics: SessionAnalysis | null; report: GeneratedReport | null };
const columns = `s.metadata, s.status, s.video_key, s.upload_key, s.completion_hash, s.calibration, s.completed, r.metrics, r.ai_summary AS report`;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function measuredRepetitions(motion: MotionSession, offset: number, includePartialStart = false): Repetition[] {
  if(motion.trackingMode==='pose')return detectBodyRepetitions(bodySignal(motion,offset),getExercise(motion.exerciseId).experimental?.12:8,includePartialStart);
  return detectRepetitions(motion.frames.map(frame => {
    const angles = frame.tracking ? pairAngles(frame.landmarks) : [];
    return { tMs: frame.t * 1000 + offset, image: frame.imageLandmarks ?? [], world: frame.worldLandmarks ?? [], valid: frame.tracking && angles.length === 4 && frame.imageLandmarks?.length === 21, spread: angles.length === 4 ? angles.slice(1).reduce((a, b) => a + b, 0) / 3 : null };
  }));
}

export class ClinicalRepository {
  constructor(readonly db: Database, readonly videos: VideoStore) {}
  async raw(id: string, db = this.db, lock = false): Promise<Row> {
    const result = await db.query<Row>(`SELECT ${columns} FROM sessions s LEFT JOIN session_reports r ON r.session_id=s.id WHERE s.id=$1${lock ? ' FOR UPDATE OF s' : ''}`, [id]);
    if (!result.rows[0]) throw new HttpError(404, 'Session not found.');
    return result.rows[0];
  }
  async record(row: Row, db = this.db): Promise<SessionRecord> {
    const { rows } = await db.query<{ metrics: Repetition }>('SELECT metrics FROM repetitions WHERE session_id=$1 ORDER BY rep_index', [row.metadata.id]);
    return { ...row.metadata, status: row.status, metrics: row.metrics, repetitions: rows.map(r => r.metrics), report: row.report };
  }
  async create(metadata: CreateSession): Promise<SessionRecord> {
    return this.db.transaction(async db => {
      const patient = (await db.query<{ demonstration: boolean }>('SELECT demonstration FROM patients WHERE id=$1', [metadata.patientId])).rows[0];
      if (!patient) throw new HttpError(404, 'Patient not found.');
      if (patient.demonstration !== metadata.demonstration) throw new HttpError(400, 'Demonstration recordings must belong to a demonstration patient.');
      if (metadata.videoKind === 'synthetic' && !metadata.demonstration) throw new HttpError(400, 'Synthetic fixtures must belong to a demonstration patient.');
      await db.query(`INSERT INTO sessions (id,patient_id,exercise_id,hand,started_at,video_mime_type,duration_ms,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (id) DO NOTHING`, [metadata.id, metadata.patientId, metadata.exerciseId, metadata.hand, metadata.startedAt, metadata.video.mimeType, metadata.video.durationMs, JSON.stringify(metadata)]);
      await db.query('UPDATE sessions SET body_region=$2,tracking_mode=$3,camera_view=$4,target_side=$5,analysis_version=$6,segmentation_cache_version=$7 WHERE id=$1 AND status=\'pending\'', [metadata.id,metadata.bodyRegion??'hand',metadata.trackingMode??'hand',metadata.cameraView??'front',metadata.targetSide??metadata.hand,metadata.analysisVersion??null,metadata.segmentationCacheVersion??null]);
      const row = await this.raw(metadata.id, db);
      if (digest(row.metadata) !== digest(metadata)) throw new HttpError(409, 'This session ID already belongs to a different recording.');
      return this.record(row, db);
    });
  }
  async uploadUrl(id: string) {
    return this.db.transaction(async db => {
      const row = await this.raw(id, db, true);
      if (row.status === 'complete') throw new HttpError(409, 'This recording is already complete.');
      // Fresh staging key per attempt. Already-issued PUT URLs can never alter a finalized video.
      const key = `staging/${id}/${randomUUID()}.${row.metadata.video.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      await db.query('UPDATE sessions SET upload_key=$2 WHERE id=$1', [id, key]);
      return this.videos.upload(key, row.metadata.video);
    });
  }
  async complete(id: string, motion: MotionSession): Promise<SessionRecord> {
    return this.db.transaction(async db => {
      const row = await this.raw(id, db, true);
      const metadata = row.metadata;
      const hash = digest(motion);
      if (row.status === 'complete') {
        if (row.completion_hash !== hash) throw new HttpError(409, 'Completion conflicts with the saved recording.');
        return this.record(row, db);
      }
      if (motion.id !== id || motion.hand !== metadata.hand || (motion.exerciseId ?? 'finger-spread-close') !== metadata.exerciseId || Date.parse(motion.createdAt) !== Date.parse(metadata.startedAt) || (motion.source === 'demo') !== (metadata.videoKind === 'synthetic') || Math.abs(motion.duration * 1000 + metadata.video.landmarkOffsetMs - metadata.video.durationMs) > 500) throw new HttpError(400, 'Video, landmarks, and recording metadata do not share the same session and clock.');
      if (['trackingMode','bodyRegion','cameraView','targetSide','analysisVersion','segmentationCacheVersion'].some(key => (motion as unknown as Record<string,unknown>)[key] !== (metadata as unknown as Record<string,unknown>)[key])) throw new HttpError(400,'Body metadata differs from the recording.');
      if (!row.upload_key) throw new HttpError(409, 'Upload the video before completing this session.');
      const finalKey = `recordings/${metadata.patientId}/${id}/${metadata.video.sha256}.${metadata.video.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      await this.videos.finalize(row.upload_key, finalKey, metadata.video);
      const metrics = analyzeSession(motion);
      const repetitions = measuredRepetitions(motion, metadata.video.landmarkOffsetMs, metadata.demonstration).filter(rep => rep.startMs >= 0 && rep.endMs <= metadata.video.durationMs);
      await db.query(`INSERT INTO ${motion.trackingMode==='pose'?'pose_frames':'hand_frames'} (session_id,captured_at,t_ms,landmarks) SELECT $1::uuid,$2::timestamptz + ((f->>'t')::double precision * interval '1 second'),(f->>'t')::double precision*1000,f FROM jsonb_array_elements($3::jsonb) f`, [id, metadata.startedAt, JSON.stringify(motion.frames)]);
      for (const [index, rep] of repetitions.entries()) await db.query('INSERT INTO repetitions (session_id,rep_index,start_ms,peak_ms,end_ms,metrics) VALUES ($1,$2,$3,$4,$5,$6::jsonb)', [id, index, rep.startMs, rep.peakMs, rep.endMs, JSON.stringify(rep)]);
      await db.query(`INSERT INTO session_reports (session_id,metrics) VALUES ($1,$2::jsonb)`, [id, JSON.stringify(metrics)]);
      await db.query(`UPDATE sessions SET status='complete',video_key=$2,calibration=$3::jsonb,completed=$4,completion_hash=$5 WHERE id=$1`, [id, finalKey, JSON.stringify({ calibration: motion.calibration, cycleDuration: motion.cycleDuration, duration: motion.duration, source: motion.source, repetitionTarget:motion.repetitionTarget }), motion.trackingMode==='pose'?Boolean(motion.completed)&&repetitions.filter(rep=>!rep.partial).length>=(motion.repetitionTarget??3):Boolean(motion.completed), hash]);
      return this.record(await this.raw(id, db), db);
    });
  }
  async detail(id: string): Promise<SessionDetail> {
    const row = await this.raw(id);
    if (row.status !== 'complete' || !row.calibration) throw new HttpError(409, 'Recording upload is not complete.');
    const { rows } = await this.db.query<{ landmarks: MotionSession['frames'][number] }>(`SELECT landmarks FROM ${row.metadata.trackingMode==='pose'?'pose_frames':'hand_frames'} WHERE session_id=$1 ORDER BY t_ms`, [id]);
    return { ...await this.record(row), motion: { id, createdAt: row.metadata.startedAt, exerciseId: row.metadata.exerciseId, hand: row.metadata.hand, trackingMode: row.metadata.trackingMode, bodyRegion: row.metadata.bodyRegion, cameraView: row.metadata.cameraView, targetSide: row.metadata.targetSide, analysisVersion: row.metadata.analysisVersion, segmentationCacheVersion: row.metadata.segmentationCacheVersion, frames: rows.map(r => r.landmarks), ...row.calibration, completed: row.completed } };
  }
  async sessions(patientId: string) {
    const { rows } = await this.db.query<Row>(`SELECT ${columns} FROM sessions s LEFT JOIN session_reports r ON r.session_id=s.id WHERE s.patient_id=$1 ORDER BY s.started_at DESC,s.id`, [patientId]);
    return Promise.all(rows.map(row => this.record(row)));
  }
  async progress(patientId: string): Promise<ProgressPoint[]> {
    // TigerData/Postgres computes the plotted metric directly from stored measurements.
    const { rows } = await this.db.query<{ metadata: CreateSession; angle: number | null; quality: number; target: unknown }>(`SELECT s.metadata,CASE WHEN s.metadata->>'trackingMode'='pose' THEN (r.metrics->'body'->>'primaryValue')::double precision ELSE (p.pair->>'achieved')::double precision END AS angle,(r.metrics->>'trackingQuality')::double precision AS quality,jsonb_build_object('neutral',s.calibration->'calibration'->'neutral','target',s.calibration->'calibration'->'target','source',s.calibration->'calibration'->'source') AS target FROM sessions s JOIN session_reports r ON r.session_id=s.id LEFT JOIN LATERAL (SELECT value AS pair FROM jsonb_array_elements(r.metrics->'pairs') WHERE value->>'pair'='Index–Middle' LIMIT 1) p ON true WHERE s.patient_id=$1 AND s.status='complete' ORDER BY s.started_at,s.id`, [patientId]);
    return rows.map(row => ({ id: row.metadata.id, startedAt: row.metadata.startedAt, hand: row.metadata.hand, exerciseId: row.metadata.exerciseId, trackingMode:row.metadata.trackingMode,cameraView:row.metadata.cameraView,analysisVersion:row.metadata.analysisVersion,targetKey: digest(row.metadata.trackingMode==='pose'?{exerciseId:row.metadata.exerciseId,side:row.metadata.hand,cameraView:row.metadata.cameraView,analysisVersion:row.metadata.analysisVersion}:row.target), angle: row.angle === null ? null : Number(row.angle), trackingQuality: Number(row.quality), durationMs: row.metadata.video.durationMs }));
  }
  async patients(ids: string[], now = new Date()): Promise<PatientOverview[]> {
    const { rows } = await this.db.query<{ id: string; display_name: string; demonstration: boolean; schedule: Patient['schedule'] }>('SELECT id,display_name,demonstration,schedule FROM patients WHERE id=ANY($1::uuid[]) ORDER BY display_name', [ids]);
    return Promise.all(rows.map(async row => {
      const history = (await this.sessions(row.id)).filter(s => s.status === 'complete');
      const completed = (await this.db.query<{ started_at: Date | string }>('SELECT started_at FROM sessions WHERE patient_id=$1 AND completed=true AND status=\'complete\' ORDER BY started_at', [row.id])).rows;
      const zone = row.schedule?.timeZone ?? 'UTC';
      const dateKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      const days = new Set(completed.map(s => dateKey(new Date(s.started_at))));
      let attended = 0, scheduled = 0;
      if (row.schedule) for (let i = 0; i < 28; i++) {
        const date = new Date(now.getTime() - i * 86400000);
        const weekday = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(date);
        if (row.schedule.weekdays.includes(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday))) { scheduled++; if (days.has(dateKey(date))) attended++; }
      }
      const latest = history.find(s => s.metrics?.pairs.some(p => p.pair === 'Index–Middle'));
      return { id: row.id, displayName: row.display_name, demonstration: row.demonstration, schedule: row.schedule, totalSessions: history.length, lastPracticeAt: history[0]?.startedAt ?? null, latestSpread: latest?.metrics?.pairs.find(p => p.pair === 'Index–Middle')?.achieved ?? null, adherence: { attended, scheduled, percent: scheduled ? attended / scheduled * 100 : null } };
    }));
  }
  async videoUrl(id: string) {
    const row = await this.raw(id);
    if (row.status !== 'complete' || !row.video_key) throw new HttpError(409, 'Video upload is not complete.');
    return this.videos.playback(row.video_key);
  }
  async saveReport(id: string, report: GeneratedReport) {
    await this.db.query('UPDATE session_reports SET ai_summary=$2::jsonb,model_version=$3,created_at=$4 WHERE session_id=$1', [id, JSON.stringify(report), report.modelVersion, report.createdAt]);
    return report;
  }
}
