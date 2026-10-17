import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileText, Leaf, LogOut, RefreshCw } from 'lucide-react';
import type { EchoSession } from '../movement-echoes/types';
import { fetchEchoSessions } from '../clinical-data/echoAdapter';
import { clinicalRepository, useClinicalAccess } from '../clinical-data/access';
import type { PatientOverview, ProgressPoint, SessionDetail, SessionRecord, SessionRepository } from '../clinical-data/contracts';
import AccessPanel from './AccessPanel';
import './clinician.css';
const MovementEchoes = lazy(() => import('../movement-echoes/MovementEchoes'));
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function ClinicianDashboard({ onBack, repository = clinicalRepository }: { onBack?: () => void; repository?: SessionRepository }) {
  const { access, setAccess } = useClinicalAccess();
  const [patients, setPatients] = useState<PatientOverview[]>([]), [patientId, setPatientId] = useState('');
  const [sessions, setSessions] = useState<SessionRecord[]>([]), [points, setPoints] = useState<ProgressPoint[]>([]);
  const [selected, setSelected] = useState<string[]>([]), [focused, setFocused] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null), [video, setVideo] = useState<Blob | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0), [reportBusy, setReportBusy] = useState(false);
  const [echoes, setEchoes] = useState<EchoSession[] | null>(null), [echoBusy, setEchoBusy] = useState(false);
  const [hand, setHand] = useState<'Left' | 'Right'>('Right'), [target, setTarget] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const patient = patients.find(p => p.id === patientId);
  useEffect(() => {
    if (!access?.patientId) return;
    const controller = new AbortController(); setError(''); setLoading(true);
    void repository.patients(controller.signal).then(list => { setPatients(list); setPatientId(current => list.some(p => p.id === current) ? current : list[0]?.id ?? ''); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [access, repository, refresh]);
  useEffect(() => {
    setSelected([]); setFocused(''); setSessions([]); setPoints([]); setDetail(null); setVideo(null); setEchoes(null);
    if (!patientId || !access) return;
    const controller = new AbortController(); setLoading(true); setError('');
    void Promise.all([repository.sessions(patientId, controller.signal), repository.progress(patientId, controller.signal)]).then(([history, trend]) => { setSessions(history); setPoints(trend); const latest = trend.at(-1); setHand(latest?.hand ?? 'Right'); setTarget(latest?.targetKey ?? ''); setFocused(history.find(s => s.status === 'complete')?.id ?? ''); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [patientId, access, repository, refresh]);
  useEffect(() => {
    setDetail(null); setVideo(null);
    if (!focused) return;
    const controller = new AbortController(); setError('');
    void Promise.all([repository.detail(focused, controller.signal), repository.video(focused, controller.signal)]).then(([record, blob]) => { setDetail(record); setVideo(blob); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [focused, repository, refresh]);
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !video) return;
    const url = URL.createObjectURL(video);
    const restoreStart = () => { element.currentTime = 0; };
    const normalizeDuration = () => {
      // MediaRecorder WebM files may omit a duration until the decoder visits the end.
      if (!Number.isFinite(element.duration)) { element.addEventListener('seeked', restoreStart, { once: true }); element.currentTime = 1e8; }
    };
    element.addEventListener('loadedmetadata', normalizeDuration); element.src = url;
    return () => { element.removeEventListener('loadedmetadata', normalizeDuration); element.removeEventListener('seeked', restoreStart); element.pause(); element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url); };
  }, [video, detail?.id, echoes]);
  const seek = (milliseconds: number) => { if (videoRef.current && detail) videoRef.current.currentTime = Math.max(0, Math.min(detail.video.durationMs / 1000, milliseconds / 1000)); };
  const summary = async () => {
    if (!detail) return;
    const id = detail.id; setReportBusy(true); setError('');
    try { const report = await repository.report(id); setDetail(current => current?.id === id ? { ...current, report } : current); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Summary unavailable.'); }
    finally { setReportBusy(false); }
  };
  const launchEchoes = async () => {
    setEchoBusy(true); setError('');
    try { setEchoes(await fetchEchoSessions(repository, selected)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load comparisons.'); }
    finally { setEchoBusy(false); }
  };
  const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : ids.length < 4 ? [...ids, id] : ids);
  const handPoints = points.filter(p => p.hand === hand);
  const groups = [...new Set(handPoints.map(p => p.targetKey))];
  const visiblePoints = handPoints.filter(p => p.targetKey === (groups.includes(target) ? target : groups.at(-1)));
  const plotted = visiblePoints.filter(p => p.angle !== null);
  const max = Math.max(30, ...plotted.map(p => p.angle! + 5));
  const x = (i: number) => { const first = Date.parse(plotted[0]?.startedAt ?? ''), last = Date.parse(plotted.at(-1)?.startedAt ?? ''); return last === first ? 300 : 50 + (Date.parse(plotted[i].startedAt) - first) / (last - first) * 500; };
  const y = (angle: number) => 190 - angle / max * 150;
  if (echoes) return <Suspense fallback={<p>Loading comparisons…</p>}><MovementEchoes providedOnly sessions={echoes} initialFocusedSessionId={echoes[0]?.id} onClose={() => setEchoes(null)}/></Suspense>;
  return <div className="clinical-shell">
    <header className="clinical-header"><div><span className="clinical-brand"><Leaf size={25}/>ReMotion<span>.</span></span><h1>Clinician dashboard</h1></div><div className="clinical-actions">{onBack&&<button className="btn btn-secondary" onClick={onBack}><ArrowLeft size={17}/>Home</button>}{access&&<button className="btn btn-secondary" onClick={() => { setAccess(null); setPatients([]); setPatientId(''); }}><LogOut size={17}/>Disconnect</button>}</div></header>
    {!access?.patientId ? <AccessPanel/> : <>
      <div className="clinical-patient-bar"><label htmlFor="clinical-patient">Patient</label><select id="clinical-patient" value={patientId} onChange={event => setPatientId(event.target.value)}>{patients.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select><button className="icon-button" aria-label="Refresh patient data" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={20}/></button>{patient?.demonstration&&<span className="badge">FICTIONAL DEMO</span>}</div>
      {loading&&<p role="status">Loading recordings…</p>}{error&&<p className="clinical-error" role="alert">{error}<button onClick={() => setRefresh(value => value + 1)}>Retry</button></p>}
      <section className="clinical-overview" aria-label="Patient overview"><article><span>Recorded sessions</span><strong>{patient?.totalSessions ?? 0}</strong></article><article><span>Last practice</span><strong>{dateLabel(patient?.lastPracticeAt ?? null)}</strong></article><article><span>Scheduled days · Last 28 days</span><strong>{patient?.adherence.percent == null ? 'Not configured' : `${patient.adherence.attended}/${patient.adherence.scheduled}`}</strong></article><article><span>Latest index–middle angle</span><strong>{patient?.latestSpread == null ? '—' : `${patient.latestSpread.toFixed(1)}°`}</strong></article></section>
      <section className="clinical-section panel" aria-label="Progress visualization"><div className="section-heading"><h2>Finger separation</h2><div className="clinical-actions"><select aria-label="Chart hand" value={hand} onChange={event => setHand(event.target.value as 'Left' | 'Right')}><option>Right</option><option>Left</option></select>{groups.length>1&&<select aria-label="Chart calibration" value={groups.includes(target) ? target : groups.at(-1)} onChange={event => setTarget(event.target.value)}>{groups.map((group, i) => <option key={group} value={group}>Calibration {i + 1}</option>)}</select>}</div></div>
        {plotted.length ? <><svg className="clinical-chart" viewBox="0 0 600 235" role="img" aria-label="Estimated index–middle hold angle by session date">{[0,max/2,max].map(value => <g key={value}><line x1="50" x2="550" y1={y(value)} y2={y(value)} stroke="#d9dfd3"/><text x="4" y={y(value)+5}>{Math.round(value)}°</text></g>)}<polyline fill="none" stroke="#254d3c" strokeWidth="3" points={plotted.map((p, i) => `${x(i)},${y(p.angle!)}`).join(' ')}/>{plotted.map((p, i) => <g key={p.id}><circle cx={x(i)} cy={y(p.angle!)} r="6" fill={p.trackingQuality<80?'#b7695d':'#254d3c'}/><title>{dateLabel(p.startedAt)}: {p.angle!.toFixed(1)}°, tracking {p.trackingQuality.toFixed(0)}%</title></g>)}<text x="50" y="225">{dateLabel(plotted[0].startedAt)}</text><text x="550" textAnchor="end" y="225">{plotted.length>1?dateLabel(plotted.at(-1)!.startedAt):''}</text></svg><details><summary>Chart values</summary><ul>{visiblePoints.map(point => <li key={point.id}>{dateLabel(point.startedAt)} · {point.angle?.toFixed(1) ?? 'Insufficient data'}{point.angle!==null?'°':''} · {point.trackingQuality.toFixed(0)}% tracked</li>)}</ul></details></> : <p>No comparable measurements.</p>}
        <p className="clinical-note">Estimated hold angles · Same hand and calibration · Amber points have less than 80% tracking coverage. This is not a recovery score.</p>
      </section>
      <section className="clinical-section clinical-history panel" aria-label="Session history"><div className="section-heading"><h2>Recordings</h2><span>{sessions.filter(s => s.status === 'complete').length}</span></div>
        <div className="clinical-recordings"><div className="clinical-session-list">{sessions.length ? sessions.map(record => <div key={record.id} className={record.id===focused?'clinical-session selected':'clinical-session'}><input type="checkbox" aria-label={`Compare recording ${dateLabel(record.startedAt)}`} checked={selected.includes(record.id)} disabled={record.status!=='complete'||(!selected.includes(record.id)&&selected.length>=4)} onChange={() => toggle(record.id)}/><button disabled={record.status!=='complete'} onClick={() => setFocused(record.id)}><strong>{dateLabel(record.startedAt)}</strong><span>{record.hand} hand · {(record.video.durationMs/1000).toFixed(1)}s · {record.status==='complete'?`${record.repetitions.length} detected cycles`:'Upload pending'}</span><span>{record.metrics?`${record.metrics.trackingQuality.toFixed(0)}% tracked`:''}{record.videoKind==='synthetic'?' · Synthetic fixture':''}</span></button></div>) : <p>No recordings uploaded.</p>}</div>
          <div className="clinical-replay">{detail&&video ? <><video ref={videoRef} controls playsInline muted aria-label="Saved session video"/><div className="clinical-seek-list">{detail.repetitions.map((rep, i) => <button className="text-button" key={i} onClick={() => seek(rep.peakMs)}>Cycle {i+1} · Peak {(rep.peakMs/1000).toFixed(1)}s</button>)}{detail.metrics?.deviations.map(event => <button className="text-button" key={event.id} onClick={() => seek(event.t*1000+detail.video.landmarkOffsetMs)}>{event.pair} · {(event.t+detail.video.landmarkOffsetMs/1000).toFixed(1)}s</button>)}</div>
            <div className="clinical-report"><div className="section-heading"><h3>Session report</h3><div className="clinical-actions"><button className="text-button" disabled={reportBusy} onClick={() => void summary()}><FileText size={16}/>{reportBusy?'Generating…':detail.report?'Refresh view':'Generate summary'}</button><button className="text-button" onClick={() => window.print()}>Print</button></div></div>{detail.report ? <><p>{detail.report.clinicianSummary}</p><details><summary>Patient summary</summary><p>{detail.report.patientSummary}</p></details><ul>{detail.report.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul><small>{detail.report.modelVersion} · {dateLabel(detail.report.createdAt)}</small></> : <p>Measurements saved. No AI summary generated.</p>}<div className="clinical-measurements">{detail.metrics?.pairs.map(pair => <div key={pair.pair}><span>{pair.pair}</span><strong>{pair.achieved.toFixed(1)}°</strong><small>Target {pair.target.toFixed(1)}°</small></div>)}</div></div>
          </> : <p>{focused?'Loading video…':'Select a recording.'}</p>}</div></div>
      </section>
      <section className="clinical-section clinical-echoes panel" aria-label="Movement Echoes integration"><div><h2>Movement Echoes</h2><p>Select 2–4 recordings of the same hand, exercise, and orientation.</p></div><button className="btn btn-primary" disabled={selected.length<2||echoBusy} onClick={() => void launchEchoes()}>{echoBusy?'Loading…':`Compare${selected.length?` (${selected.length})`:''}`}</button></section>
    </>}
  </div>;
}
