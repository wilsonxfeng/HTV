import { useState } from 'react';
import { demoAccess, useClinicalAccess } from '../clinical-data/access';
import type { ClinicalAccess } from '../clinical-data/access';
import { API_BASE_URL } from '../clinical-data/access';
import { ApiSessionRepository } from '../clinical-data/api';

export default function AccessPanel({ role = 'clinician' }: { role?: ClinicalAccess['role'] }) {
  const [token, setToken] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const setAccess = useClinicalAccess(s => s.setAccess);
  const connect = async (demo = false) => {
    setBusy(true); setError('');
    try {
      if (demo) setAccess(await demoAccess(role));
      else {
        // Server validates the token and returns only the granted patients.
        const patients = await new ApiSessionRepository(API_BASE_URL, () => token).patients();
        if (!patients.length) throw Error('No patients are assigned to this access token.');
        setAccess({ token, role, patientId: patients[0].id, demonstration: patients[0].demonstration });
      }
    } catch (cause) { setAccess(null); setError(cause instanceof Error ? cause.message : 'Access failed.'); }
    finally { setBusy(false); }
  };
  return <section className="clinical-access panel"><h2>{role === 'clinician' ? 'Clinician access' : 'Connect a patient'}</h2><form onSubmit={event => { event.preventDefault(); void connect(); }}><label htmlFor="clinical-token">Access token</label><input id="clinical-token" type="password" value={token} autoComplete="off" onChange={event => setToken(event.target.value)}/><button className="btn btn-primary" disabled={busy || !token.trim()}>Connect</button></form><button className="text-button" disabled={busy} onClick={() => void connect(true)}>Use local demo</button>{error && <p role="alert" className="clinical-error">{error}</p>}</section>;
}
