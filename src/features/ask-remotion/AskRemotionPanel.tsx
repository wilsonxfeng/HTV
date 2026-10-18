import { useEffect, useRef, useState } from 'react';
import { clinicalRepository } from '../clinical-data/access';
import type { EchoSession } from '../movement-echoes/types';
import type { Evidence, SearchPreset, SearchResult } from './contracts';
import { clientReply, GREATEST_FINGER_QUESTION, isGreatestFingerQuestion, searchRecordings } from './localSearch';
import './ask-remotion.css';
const suggestions: { preset: SearchPreset; label: string }[] = [
  { preset: 'greatest-finger', label: 'Greatest finger opening' },
  { preset: 'first-latest-finger', label: 'First vs. latest finger opening' },
  { preset: 'smallest-knee', label: 'Smallest knee-extension range' },
];
interface Props {
  patientId?: string; exerciseId: string; side: EchoSession['selectedHand'];
  recordings?: EchoSession[]; focusId?: string;
  onOpen: (evidence: Evidence[], signal: AbortSignal) => Promise<void>;
}
export default function AskRemotionPanel({ patientId, exerciseId, side, recordings = [], focusId = '', onOpen }: Props) {
  const [question, setQuestion] = useState(''), [reply, setReply] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  // Focusing a search result must not reset the reply or cancel its navigation.
  useEffect(() => { controller.current?.abort(); setReply(''); setError(''); setBusy(false); return () => controller.current?.abort(); }, [patientId]);
  async function search(preset?: SearchPreset) {
    controller.current?.abort(); const next = new AbortController(); controller.current = next;
    setError(''); setReply(''); setBusy(true);
    const selectedPreset = preset ?? (isGreatestFingerQuestion(question) ? 'greatest-finger' : undefined);
    try {
      let response: SearchResult;
      if (patientId && side !== 'Unconfirmed') {
        response = await clinicalRepository.request<SearchResult>('/api/ask-remotion', { method: 'POST', signal: next.signal,
          body: JSON.stringify({ patientId, question: selectedPreset === 'greatest-finger' ? GREATEST_FINGER_QUESTION : selectedPreset ? suggestions.find(s => s.preset === selectedPreset)!.label : question, exerciseContext: { exerciseId, side }, ...(selectedPreset ? { preset: selectedPreset } : {}) }) });
      } else if (selectedPreset) response = searchRecordings(recordings, focusId, selectedPreset);
      else { setReply('Try one of the questions below to explore these recordings.'); return; }
      if (next.signal.aborted) return;
      if (response.evidence.length && response.evidence.every(e => e.playable)) await onOpen(response.evidence, next.signal);
      if (!next.signal.aborted) setReply(clientReply(response, selectedPreset));
    } catch (cause) { if (!next.signal.aborted) setError(cause instanceof Error ? cause.message : 'That recording could not be opened. Try again.'); }
    finally { if (!next.signal.aborted) setBusy(false); }
  }
  return <section className="ask-remotion" aria-label="Ask ReMotion">
    <h2>Ask ReMotion</h2>
    <form onSubmit={event => { event.preventDefault(); void search(); }}>
      <label className="echo-sr-only" htmlFor="ask-remotion-question">Ask about recorded movements</label>
      <div className="ask-remotion-input"><input id="ask-remotion-question" value={question} maxLength={1000} onChange={e => setQuestion(e.target.value)} placeholder="Ask about a recording…"/><button disabled={!question.trim()} type="submit">Ask</button></div>
    </form>
    <div className="ask-remotion-suggestions">{suggestions.filter(s => s.preset === 'smallest-knee' ? exerciseId === 'seated-knee-extension' : exerciseId === 'finger-spread-close').map(s => <button key={s.preset} aria-label={s.preset === 'greatest-finger' ? GREATEST_FINGER_QUESTION : s.preset === 'first-latest-finger' ? 'Compare first and latest' : 'Find smallest knee movement'} onClick={() => void search(s.preset)}>{s.label}</button>)}</div>
    {busy && <p role="status">Finding your recording…</p>}
    {error && <p role="alert">{error}</p>}
    {reply && <p className="ask-remotion-reply" role="status">{reply}</p>}
  </section>;
}
