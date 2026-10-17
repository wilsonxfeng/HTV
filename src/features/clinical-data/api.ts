import type { CreateSession, GeneratedReport, PatientOverview, ProgressPoint, SessionDetail, SessionRecord, SessionRepository, SignedTransfer } from './contracts';
import type { MotionSession } from '../../lib/types';

export class ApiSessionRepository implements SessionRepository {
  constructor(readonly baseUrl: string, private token: () => string | null, private fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...options, cache: 'no-store', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(this.token() ? { Authorization: `Bearer ${this.token()}` } : {}), ...options.headers } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Request failed (${response.status}).`);
    }
    return response.json() as Promise<T>;
  }
  patients(signal?: AbortSignal) { return this.request<PatientOverview[]>('/api/patients', { signal }); }
  sessions(patientId: string, signal?: AbortSignal) { return this.request<SessionRecord[]>(`/api/patients/${encodeURIComponent(patientId)}/sessions`, { signal }); }
  detail(id: string, signal?: AbortSignal) { return this.request<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`, { signal }); }
  progress(patientId: string, signal?: AbortSignal) { return this.request<ProgressPoint[]>(`/api/patients/${encodeURIComponent(patientId)}/progress`, { signal }); }
  report(id: string) { return this.request<GeneratedReport>(`/api/sessions/${encodeURIComponent(id)}/report`, { method: 'POST' }); }
  async video(id: string, signal?: AbortSignal) {
    const signed = await this.request<SignedTransfer>(`/api/sessions/${encodeURIComponent(id)}/video-url`, { signal });
    const response = await this.fetcher(signed.url, { signal, cache: 'no-store' });
    if (!response.ok) throw Error('Video link expired or download failed. Retry playback.');
    return response.blob();
  }
  async upload(session: CreateSession, motion: MotionSession, video: Blob, signal?: AbortSignal) {
    const record = await this.request<SessionRecord>('/api/sessions', { method: 'POST', body: JSON.stringify(session), signal });
    if (record.status !== 'complete') {
      const signed = await this.request<SignedTransfer>(`/api/sessions/${session.id}/upload-url`, { method: 'POST', signal });
      const response = await this.fetcher(signed.url, { method: 'PUT', body: video, headers: signed.headers, signal });
      if (!response.ok) throw Error('Video upload interrupted. The local recording is preserved; retry upload.');
    }
    return this.request<SessionRecord>(`/api/sessions/${session.id}/complete`, { method: 'POST', body: JSON.stringify({ motion }), signal });
  }
}
