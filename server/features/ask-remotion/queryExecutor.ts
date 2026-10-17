import type { Database } from '../../db';
import { fingerPairLabels, metricCatalog, type Evidence, type SearchIntent, type SearchResult } from '../../../src/features/ask-remotion/contracts';
interface Row { id: string; started_at: string | Date; exercise_id: string; metadata: { video: { durationMs: number; mirrored?: boolean }; videoKind: string; demonstration?: boolean; trackingMode?: string }; calibration: { calibration?: { neutral: unknown; target: unknown; source: unknown } } | null; camera_view: string | null; analysis_version: string | null; video_key: string | null; metrics: { trackingQuality: number; pairs?: {pair:string;achieved:number}[]; body?: { movementRange: number | null; maximumAngle: number | null } }; rep_index: number | null; peak_ms: number | null; rep: { valid: boolean; coverage: number; peakSpread: number; static?:boolean } | null }
/** All candidate rows are fetched with an authorized patient parameter. No model-supplied SQL. */
export async function executeSearch(db: Database, patientId: string, intent: SearchIntent, source: SearchResult['source']): Promise<SearchResult> {
  const metric = metricCatalog[intent.metricKey];
  const base = { source, metricLabel:metric.label };
  if(intent.type === 'unsupported') return {...base,status:'unsupported',message:'Choose a recorded movement metric, such as finger opening or knee-angle range. This search cannot assess recovery or give treatment advice.',evidence:[],action:null};
  const {rows} = await db.query<Row>(`SELECT s.id,s.started_at,s.exercise_id,s.metadata,s.calibration,s.camera_view,s.analysis_version,s.video_key,r.metrics,p.rep_index,p.peak_ms,p.metrics AS rep FROM sessions s JOIN session_reports r ON r.session_id=s.id LEFT JOIN repetitions p ON p.session_id=s.id WHERE s.patient_id=$1 AND s.exercise_id=$2 AND s.hand=$3 AND s.status='complete' ORDER BY s.started_at,s.id,p.rep_index`,[patientId,metric.exerciseId,intent.side]);
  const metricValue = (r: Row) => intent.metricKey in fingerPairLabels ? r.metrics.pairs?.find(p=>p.pair===fingerPairLabels[intent.metricKey as keyof typeof fingerPairLabels])?.achieved : intent.metricKey === 'finger_opening' ? r.rep?.peakSpread : intent.metricKey === 'knee_peak' ? r.metrics.body?.maximumAngle : r.metrics.body?.movementRange;
  const valid = rows.filter(r => Number.isFinite(metricValue(r)) && Number.isFinite(r.metrics.trackingQuality) && r.metrics.trackingQuality >= 80 && (intent.metricKey !== 'finger_opening' || (r.rep?.valid && !r.rep.static && r.rep.coverage >= .8)));
  // Anchor compatibility to the latest eligible recording. Never mix calibration/configuration or fixture kinds.
  const cohort = (r: Row) => JSON.stringify([r.camera_view,r.analysis_version,r.metadata.videoKind,r.metadata.video.mirrored,r.metadata.demonstration,r.metadata.trackingMode, metric.exerciseId === 'finger-spread-close' ? [r.calibration?.calibration?.neutral,r.calibration?.calibration?.target,r.calibration?.calibration?.source] : null]);
  const latest = valid.at(-1);
  const candidates: Evidence[] = valid.filter(r => latest && cohort(r) === cohort(latest)).flatMap(r => {
    const value = metricValue(r);
    if(typeof value !== 'number' || !Number.isFinite(value)) return [];
    const timestamp = intent.metricKey === 'finger_opening' && r.peak_ms !== null && Number(r.peak_ms) >= 0 && Number(r.peak_ms) <= r.metadata.video.durationMs ? Number(r.peak_ms) : null;
    return [{side:intent.side,sessionId:r.id,repetitionIndex:intent.metricKey==='finger_opening'?r.rep_index:null,timestampMs:timestamp,recordedAt:new Date(r.started_at).toISOString(),exerciseId:r.exercise_id,metricKey:intent.metricKey,metricValue:value,metricUnit:metric.unit,qualityStatus:`${r.metrics.trackingQuality.toFixed(0)}% tracked`,playable:Boolean(r.video_key)}];
  });
  // A session's representative finger metric is its largest valid detected repetition peak.
  const perSession = [...new Set(candidates.map(c=>c.sessionId))].map(id=>candidates.filter(c=>c.sessionId===id).reduce((a,b)=>a.metricValue>=b.metricValue?a:b));
  let evidence: Evidence[]=[];
  if(intent.type==='find_extreme' && candidates.length) evidence=[candidates.reduce((a,b)=>intent.aggregation==='max'?(a.metricValue>=b.metricValue?a:b):(a.metricValue<=b.metricValue?a:b))];
  else if(intent.type==='compare_sessions' && perSession.length>=2) evidence=[perSession[0],perSession.at(-1)!];
  else if(intent.type==='find_recent' && perSession.length) evidence=[intent.aggregation==='first'?perSession[0]:perSession.at(-1)!];
  if(!evidence.length) return {...base,status:'empty',message:intent.type==='compare_sessions'?'At least two compatible, adequately tracked sessions are needed.':'No adequately tracked measurements match this exercise, side and configuration.',evidence:[],action:null};
  const message = evidence.length===2 ? `First to latest: ${evidence[0].metricValue.toFixed(1)}° → ${evidence[1].metricValue.toFixed(1)}° (${(evidence[1].metricValue-evidence[0].metricValue).toFixed(1)}° difference).` : `${intent.aggregation === 'max'?'Greatest':intent.aggregation==='min'?'Smallest':'Recorded'} value: ${evidence[0].metricValue.toFixed(1)}°.`;
  return {...base,status:'ok',message:`${message} ${intent.type==='compare_sessions' && intent.metricKey==='finger_opening'?'Each session uses its greatest valid repetition peak. ':''}${intent.side} side. Compared within the latest eligible configuration; tracking below 80% excluded. Camera estimates, not a recovery score.`,evidence,action:{type:evidence.length===2?'compare_sessions':'focus_session',sessionIds:evidence.map(e=>e.sessionId),pause:true}};
}
