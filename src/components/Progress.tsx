import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Layers, RefreshCw } from 'lucide-react';
import { useApp } from '../lib/store';
import { analyzeSession } from '../lib/analysis';
import { WeekCalendar } from './Garden';
import History from './History';
import AskRemotionPanel from '../features/ask-remotion/AskRemotionPanel';
import type { Evidence, EvidenceFocus } from '../features/ask-remotion/contracts';
import { HISTORY_UPDATED_EVENT } from '../features/clinical-data/outbox';
import { clinicalRepository, useClinicalAccess } from '../features/clinical-data/access';
import type { PatientOverview, ProgressPoint, SessionRecord } from '../features/clinical-data/contracts';
import { fetchEchoSessions, toEchoSession } from '../features/clinical-data/echoAdapter';
import { exerciseRegistry, getExercise } from '../features/body-exercises/exerciseRegistry';
import type { EchoSession } from '../features/movement-echoes/types';
import './progress.css';
const MovementEchoes = lazy(() => import('../features/movement-echoes/MovementEchoes'));
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
type Viewer = { kind: 'device' | 'synced'; sessions?: EchoSession[]; focus?: EvidenceFocus };

export default function Progress() {
  const { sessions: localSessions, navigate } = useApp();
  const { access } = useClinicalAccess();
  const [source, setSource] = useState<'device' | 'synced'>(access ? 'synced' : 'device');
  const [exerciseId, setExerciseId] = useState('finger-spread-close');
  const [side, setSide] = useState<'Right' | 'Left'>('Right');
  const [patients, setPatients] = useState<PatientOverview[]>([]);
  const [patientId, setPatientId] = useState(access?.patientId ?? '');
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [remotePoints, setRemotePoints] = useState<ProgressPoint[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const loadController = useRef<AbortController | null>(null);
  const exercise = getExercise(exerciseId);
  const synced = source === 'synced' && !!access;

  useEffect(() => {
    setPatientId(access?.patientId ?? ''); setPatients([]); setSource(access ? 'synced' : 'device');
  }, [access]);
  useEffect(() => {
    if (!access || !synced) return;
    const controller = new AbortController();
    void clinicalRepository.patients(controller.signal).then(list => {
      if (!controller.signal.aborted) setPatients(list);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [access, synced, refresh]);
  useEffect(() => {
    const uploaded = () => setRefresh(value => value + 1);
    window.addEventListener(HISTORY_UPDATED_EVENT, uploaded);
    return () => window.removeEventListener(HISTORY_UPDATED_EVENT, uploaded);
  }, []);
  useEffect(() => {
    setRecords([]); setRemotePoints([]);
    if (!synced || !patientId) return;
    const controller = new AbortController(); setLoading(true); setError('');
    void Promise.all([clinicalRepository.sessions(patientId, controller.signal), clinicalRepository.progress(patientId, controller.signal)])
      .then(([history, points]) => { if (!controller.signal.aborted) { setRecords(history); setRemotePoints(points); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); setLoading(false); };
  }, [synced, patientId, access, refresh]);
  useEffect(() => {
    loadController.current?.abort(); setViewer(null); setSelected([]); setTarget(''); setBusy(false); setError('');
    return () => loadController.current?.abort();
  }, [source, patientId, access, exerciseId, side]);

  const points = useMemo<ProgressPoint[]>(() => synced ? remotePoints : localSessions.filter(s => s.source === 'camera').map(s => {
    const analysis = analyzeSession(s);
    return { id: s.id, startedAt: s.createdAt, exerciseId: s.exerciseId ?? 'finger-spread-close', hand: s.hand,
      targetKey: s.trackingMode === 'pose' ? `${s.analysisVersion}:${s.cameraView}` : JSON.stringify([s.calibration.neutral, s.calibration.target, s.calibration.source]),
      angle: analysis.body ? analysis.body.primaryValue : analysis.pairs.find(p => p.pair === 'Index–Middle')?.achieved ?? null,
      trackingQuality: analysis.trackingQuality, durationMs: s.duration * 1000 };
  }), [synced, remotePoints, localSessions]);
  const filteredPoints = points.filter(p => p.exerciseId === exerciseId && p.hand === side).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const groups = [...new Set(filteredPoints.map(p => p.targetKey))];
  const plotted = filteredPoints.filter(p => p.targetKey === (groups.includes(target) ? target : groups.at(-1)) && p.angle !== null);
  const history = records.filter(s => s.exerciseId === exerciseId && s.hand === side);
  const max = Math.max(30, ...plotted.map(p => p.angle! + 5));
  const x = (i: number) => { const first = Date.parse(plotted[0]?.startedAt ?? ''), last = Date.parse(plotted.at(-1)?.startedAt ?? ''); return first === last ? 160 : 44 + (Date.parse(plotted[i].startedAt) - first) / (last - first) * 232; };
  const y = (value: number) => 154 - value / max * 115;

  async function openEvidence(evidence: Evidence[], signal: AbortSignal) {
    loadController.current?.abort(); setBusy(false);
    const loaded = evidence.length === 1
      ? [toEchoSession(await clinicalRepository.detail(evidence[0].sessionId, signal), await clinicalRepository.video(evidence[0].sessionId, signal))]
      : await fetchEchoSessions(clinicalRepository, evidence.map(e => e.sessionId), signal);
    if (signal.aborted) return;
    setViewer(current => ({ kind: 'synced', sessions: [...new Map([...(current?.kind === 'synced' ? current.sessions ?? [] : []), ...loaded].map(s => [s.id, s])).values()], focus: { ...evidence[0], token: Date.now() } }));
  }
  async function openRecordings(ids: string[]) {
    loadController.current?.abort(); const controller = new AbortController(); loadController.current = controller;
    setBusy(true); setError('');
    try {
      const loaded = ids.length === 1
        ? [toEchoSession(await clinicalRepository.detail(ids[0], controller.signal), await clinicalRepository.video(ids[0], controller.signal))]
        : await fetchEchoSessions(clinicalRepository, ids, controller.signal);
      if (!controller.signal.aborted) setViewer({ kind: 'synced', sessions: loaded });
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not open recordings.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="progress-page content-page page-enter">
    <div className="page-heading"><h1>Progress</h1><img className="progress-flower" src="/assets/garden/stage-4.webp" alt=""/></div>
    {!viewer && <WeekCalendar sessions={localSessions}/>}
    <AskRemotionPanel patientId={patientId} exerciseId={exerciseId} side={side} enabled={synced && !!patientId} onOpen={openEvidence}/>
    {!viewer && <div className="progress-history-controls">
      <div className="progress-filters">
        <label>Exercise<select value={exerciseId} onChange={e => setExerciseId(e.target.value)}>{exerciseRegistry.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Side<select value={side} onChange={e => setSide(e.target.value as 'Left' | 'Right')}><option>Right</option><option>Left</option></select></label>
        {access && <label>History<select value={source} onChange={e => setSource(e.target.value as 'device' | 'synced')}><option value="synced">Synced recordings</option><option value="device">On this device</option></select></label>}
        {synced && patients.length > 1 && <label>Person<select value={patientId} onChange={e => setPatientId(e.target.value)}>{patients.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>}
        {synced && <button className="icon-button" aria-label="Refresh history" onClick={() => setRefresh(v => v + 1)}><RefreshCw size={20}/></button>}
      </div>
    </div>}
    {error && <p role="alert" className="progress-error">{error}</p>}
    {(loading || busy) && <p role="status">{busy ? 'Opening recordings…' : 'Loading history…'}</p>}
    {viewer ? <Suspense fallback={<p role="status">Opening Movement Echoes…</p>}><MovementEchoes
      key={viewer.kind} sessions={viewer.sessions} initialFocusedSessionId={viewer.sessions?.[0]?.id} evidenceFocus={viewer.focus}
      providedOnly={viewer.kind !== 'device'} backLabel="Back to Progress"
      onDeleted={async id => { if (localSessions.find(s => s.id === id)?.trackingMode === 'pose') await useApp.getState().remove(id); }}
      onClose={() => setViewer(null)}/></Suspense> : <>
      <section className="movement-trend panel">
        <div className="section-heading"><h2>{exercise.trackingMode === 'hand' ? 'Finger opening' : exercise.primaryMetric}</h2>{groups.length > 1 && <select aria-label="Chart reference" value={groups.includes(target) ? target : groups.at(-1)} onChange={e => setTarget(e.target.value)}>{groups.map((group, i) => <option key={group} value={group}>Reference {i + 1}</option>)}</select>}</div>
        {exercise.trackingMode === 'hand' && <p>Index–middle · Estimated hold angle</p>}
        {plotted.length ? <><svg className="progress-chart" viewBox="0 0 320 200" role="img" aria-label={`${exercise.title}: ${side.toLowerCase()} side across ${plotted.length} sessions`}>
          {[0, max / 2, max].map(value => <g key={value}><line x1="44" x2="286" y1={y(value)} y2={y(value)} stroke="#d9dfd3"/><text x="3" y={y(value) + 5}>{Math.round(value)}{exercise.unit}</text></g>)}
          <polyline points={plotted.map((p, i) => `${x(i)},${y(p.angle!)}`).join(' ')} stroke="#426348" strokeWidth="3" fill="none"/>
          {plotted.map((p, i) => <g key={p.id}><circle cx={x(i)} cy={y(p.angle!)} r="5" fill={p.trackingQuality < 80 ? '#b7695d' : '#426348'}/><title>{dateLabel(p.startedAt)}: {p.angle!.toFixed(1)}{exercise.unit} · {p.trackingQuality.toFixed(0)}% tracked</title></g>)}
          <text x="44" y="187">{new Date(plotted[0].startedAt).toLocaleDateString()}</text>{plotted.length > 1 && <text x="280" y="187" textAnchor="end">{new Date(plotted.at(-1)!.startedAt).toLocaleDateString()}</text>}
        </svg><details><summary>Chart values</summary><ul>{plotted.map(p => <li key={p.id}>{dateLabel(p.startedAt)}: {p.angle!.toFixed(1)}{exercise.unit}</li>)}</ul></details><p className="quiet">Camera estimates · Same reference and view · Not a recovery score</p></> : <div className="trend-empty"><img className="empty-plant" src="/assets/garden/stage-1.webp" alt=""/><h3>No comparable measurements</h3><button className="text-button" onClick={() => navigate('exercise')}>Practice<ArrowRight size={17}/></button></div>}
      </section>
      {synced ? <section className="progress-recordings panel"><div className="section-heading"><h2>Recordings</h2><button className="btn btn-primary" disabled={selected.length < 2 || busy} onClick={() => void openRecordings(selected)}>Compare{selected.length ? ` (${selected.length})` : ''}</button></div>
        {history.length ? history.map(record => <div className="progress-recording" key={record.id}>
          <input type="checkbox" aria-label={`Compare ${dateLabel(record.startedAt)}`} checked={selected.includes(record.id)} disabled={record.status !== 'complete' || (!selected.includes(record.id) && selected.length >= 4)} onChange={() => setSelected(ids => ids.includes(record.id) ? ids.filter(id => id !== record.id) : [...ids, record.id])}/>
          <button className="progress-recording-name" disabled={record.status !== 'complete' || busy} onClick={() => void openRecordings([record.id])}><strong>{dateLabel(record.startedAt)}</strong><span>{(record.video.durationMs / 1000).toFixed(0)} sec · {record.status === 'complete' ? `${record.repetitions.length} cycles` : 'Upload pending'}{record.demonstration ? ' · Demo' : ''}</span></button>
          <ArrowRight size={20}/>
        </div>) : !loading && <p>No synced recordings for this exercise and side.</p>}
      </section> : <><button className="sample-card" onClick={() => setViewer({ kind: 'device' })}><Layers size={26}/><div><h2>Movement Echoes</h2></div><ArrowRight size={21}/></button><History compact/></>}
    </>}
  </div>;
}
