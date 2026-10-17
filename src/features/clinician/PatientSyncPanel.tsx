import { useEffect, useState } from 'react';
import AccessPanel from './AccessPanel';
import { clinicalRepository, useClinicalAccess } from '../clinical-data/access';
import { recordingOutbox } from '../clinical-data/outbox';
import type { PendingRecording } from '../clinical-data/outbox';
import './clinician.css';

export default function PatientSyncPanel({ consent, onConsent, disabled, notice, version }: { consent: boolean; onConsent: (value: boolean) => void; disabled: boolean; notice: string; version: number }) {
  const { access, setAccess } = useClinicalAccess();
  const [entries, setEntries] = useState<PendingRecording[]>([]), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void recordingOutbox.list().then(list => { if (live) setEntries(list.filter(entry => entry.metadata.patientId === access?.patientId)); }).catch(() => { if (live) setError('Local video storage unavailable.'); }); return () => { live = false; }; }, [access, version, refresh]);
  const retry = async (id: string) => {
    setBusy(true); setError('');
    try { const result = await recordingOutbox.sync(id, clinicalRepository); if (result.state !== 'synced') setError(result.error ?? 'Upload failed.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.'); }
    finally { setBusy(false); setRefresh(value => value + 1); }
  };
  useEffect(() => {
    if (!access || access.role !== 'patient') return;
    const retryPending = () => { void recordingOutbox.list().then(async list => { for (const entry of list.filter(item => item.metadata.patientId === access.patientId && item.state !== 'synced')) await recordingOutbox.sync(entry.id, clinicalRepository); setRefresh(value => value + 1); }).catch(() => {}); };
    if (navigator.onLine) retryPending();
    window.addEventListener('online', retryPending); return () => window.removeEventListener('online', retryPending);
  }, [access]);
  return <details className="clinical-upload-panel"><summary>Clinician sharing</summary>{!access ? <AccessPanel role="patient"/> : access.role !== 'patient' ? <><p>Patient access is required for recording.</p><button className="text-button" disabled={disabled} onClick={() => setAccess(null)}>Disconnect clinician access</button></> : <>
    {access.demonstration&&<span className="badge">LOCAL DEMO PATIENT</span>}
    <label className="clinical-share-consent"><input type="checkbox" checked={consent} disabled={disabled} onChange={event => onConsent(event.target.checked)}/><span>Save silent camera video and hand data for my clinician. A copy stays on this device until I remove it.</span></label>
    {entries.map(entry => <div className="clinical-upload-row" key={entry.id}><span>{new Date(entry.metadata.startedAt).toLocaleString()}<small>{entry.state === 'synced' ? 'Uploaded' : entry.state === 'uploading' ? 'Upload pending' : 'Saved locally'}{entry.error?` · ${entry.error}`:''}</small></span>{entry.state !== 'synced'&&<button className="text-button" disabled={disabled||busy} onClick={() => void retry(entry.id)}>Retry</button>}<button className="text-button" disabled={disabled||busy} onClick={() => { void recordingOutbox.remove(entry.id).then(() => setRefresh(value => value + 1)).catch(cause => setError(cause.message)); }}>Remove local copy</button></div>)}
    <button className="text-button" disabled={disabled||busy} onClick={() => { onConsent(false); setAccess(null); }}>Disconnect patient</button>
  </>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="clinical-error">{error}</p>}</details>;
}
