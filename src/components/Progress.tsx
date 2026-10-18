import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ArrowRight, Layers, RefreshCw } from 'lucide-react';
import { useApp } from '../lib/store';
import { WeekCalendar } from './Garden';
import History from './History';
import { HISTORY_UPDATED_EVENT } from '../features/clinical-data/outbox';
import { clinicalRepository, useClinicalAccess } from '../features/clinical-data/access';
import type { PatientOverview, SessionRecord } from '../features/clinical-data/contracts';
import { fetchEchoSessions, toEchoSession } from '../features/clinical-data/echoAdapter';
import type { EchoSession } from '../features/movement-echoes/types';
import './progress.css';
const MovementEchoes = lazy(() => import('../features/movement-echoes/MovementEchoes'));
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
type Viewer = { kind: 'device' | 'synced'; sessions?: EchoSession[] };

export default function Progress() {
  const { sessions: localSessions } = useApp();
  const { access } = useClinicalAccess();
  const [source, setSource] = useState<'device' | 'synced'>(access ? 'synced' : 'device');
  const [patients, setPatients] = useState<PatientOverview[]>([]);
  const [patientId, setPatientId] = useState(access?.patientId ?? '');
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const loadController = useRef<AbortController | null>(null);
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
    setRecords([]);
    if (!synced || !patientId) return;
    const controller = new AbortController(); setLoading(true); setError('');
    void clinicalRepository.sessions(patientId, controller.signal)
      .then(history => { if (!controller.signal.aborted) setRecords(history); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); setLoading(false); };
  }, [synced, patientId, access, refresh]);
  useEffect(() => {
    loadController.current?.abort(); setViewer(null); setSelected([]); setBusy(false); setError('');
    return () => loadController.current?.abort();
  }, [source, patientId, access]);

  const history = records;

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
    {!viewer && <div className="page-heading"><h1>Progress</h1><img className="progress-flower" src="/assets/garden/stage-4.webp" alt=""/></div>}
    {!viewer && <WeekCalendar sessions={localSessions}/>}
    {!viewer && access && <div className="progress-history-controls">
      <div className="progress-filters">
        {access && <label>History<select value={source} onChange={e => setSource(e.target.value as 'device' | 'synced')}><option value="synced">Synced recordings</option><option value="device">On this device</option></select></label>}
        {synced && patients.length > 1 && <label>Person<select value={patientId} onChange={e => setPatientId(e.target.value)}>{patients.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>}
        {synced && <button className="icon-button" aria-label="Refresh history" onClick={() => setRefresh(v => v + 1)}><RefreshCw size={20}/></button>}
      </div>
    </div>}
    {error && <p role="alert" className="progress-error">{error}</p>}
    {(loading || busy) && <p role="status">{busy ? 'Opening recordings…' : 'Loading history…'}</p>}
    {viewer ? <Suspense fallback={<p role="status">Opening Movement Echoes…</p>}><MovementEchoes
      key={viewer.kind} sessions={viewer.sessions} initialFocusedSessionId={viewer.sessions?.[0]?.id} searchPatientId={viewer.kind === 'synced' ? patientId : undefined}
      hideManagementTools providedOnly={viewer.kind !== 'device'} backLabel="Back to Progress"
      onDeleted={async id => { if (localSessions.find(s => s.id === id)?.trackingMode === 'pose') await useApp.getState().remove(id); }}
      onClose={() => setViewer(null)}/></Suspense> : <>
      {synced ? <section className="progress-recordings panel"><div className="section-heading"><h2>Recordings</h2><button className="btn btn-primary" disabled={selected.length < 2 || busy} onClick={() => void openRecordings(selected)}>Compare selected</button></div>
        {history.length ? history.map(record => <div className="progress-recording" key={record.id}>
          <input type="checkbox" aria-label={`Compare ${dateLabel(record.startedAt)}`} checked={selected.includes(record.id)} disabled={record.status !== 'complete' || (!selected.includes(record.id) && selected.length >= 4)} onChange={() => setSelected(ids => ids.includes(record.id) ? ids.filter(id => id !== record.id) : [...ids, record.id])}/>
          <button className="progress-recording-name" disabled={record.status !== 'complete' || busy} onClick={() => void openRecordings([record.id])}><strong>{dateLabel(record.startedAt)}</strong><span>{record.status === 'complete' ? 'Ready to review' : 'Upload pending'}{record.demonstration ? ' · Demo' : ''}</span></button>
          <ArrowRight size={20}/>
        </div>) : !loading && <p>No synced recordings yet.</p>}
      </section> : <><button className="sample-card" onClick={() => setViewer({ kind: 'device' })}><Layers size={26}/><div><h2>Movement Echoes</h2></div><ArrowRight size={21}/></button><History compact/></>}
    </>}
  </div>;
}
