import './history-connection.css';
import { useState } from 'react';
import { demoAccess, useClinicalAccess } from '../access';
import type { ClinicalAccess } from '../access';
import { API_BASE_URL } from '../access';
import { ApiSessionRepository } from '../api';

export default function AccessPanel({ role = 'patient', demoRole = role }: { role?: ClinicalAccess['role']; demoRole?: ClinicalAccess['role'] }) {
  const [token, setToken] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const setAccess = useClinicalAccess(s => s.setAccess);
  const connect = async (demo = false) => {
    setBusy(true); setError('');
    try {
      if (demo) setAccess(await demoAccess(demoRole));
      else {
        // Server validates the token and returns only the granted patients.
        const patients = await new ApiSessionRepository(API_BASE_URL, () => token).patients();
        if (!patients.length) throw Error('No patients are assigned to this access token.');
        setAccess({ token, role, patientId: patients[0].id, demonstration: patients[0].demonstration });
      }
    } catch (cause) { setAccess(null); setError(cause instanceof Error ? cause.message : 'Access failed.'); }
    finally { setBusy(false); }
  };
  return <section className="clinical-access panel"><h2>Connect history</h2><form onSubmit={event => { event.preventDefault(); void connect(); }}><label htmlFor="clinical-token">Access token</label><input id="clinical-token" type="password" value={token} autoComplete="off" onChange={event => setToken(event.target.value)}/><button className="btn btn-primary" disabled={busy || !token.trim()}>Connect</button></form><button className="text-button" disabled={busy} onClick={() => void connect(true)}>Use local demo</button>{error && <p role="alert" className="clinical-error">{error}</p>}</section>;
}
