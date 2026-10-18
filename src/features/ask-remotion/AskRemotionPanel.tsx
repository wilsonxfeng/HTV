import { useEffect, useRef, useState } from 'react';
import { clinicalRepository } from '../clinical-data/access';
import type { EchoSession } from '../movement-echoes/types';
import type { Evidence } from './contracts';
import { summarizeRecordings, type ChatMessage, type ChatReply } from './chat';
import './ask-remotion.css';
interface Props {
  patientId?: string; exerciseId: string; side: EchoSession['selectedHand'];
  recordings?: EchoSession[]; focusId?: string;
  onOpen: (evidence: Evidence[], signal: AbortSignal) => Promise<void>;
}
export default function AskRemotionPanel({ patientId, recordings = [], focusId = '', onOpen }: Props) {
  const [question, setQuestion] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const log = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, busy]);
  // Focusing a search result must not reset the reply or cancel its navigation.
  useEffect(() => { controller.current?.abort(); setMessages([]); setQuestion(''); setError(''); setBusy(false); return () => controller.current?.abort(); }, [patientId]);
  async function search() {
    if (busy || !question.trim()) return;
    controller.current?.abort(); const next = new AbortController(); controller.current = next;
    setError(''); setBusy(true);
    const prompt = question.trim();
    const history = messages.slice(-20);
    setMessages(current => [...current, { role: 'user', content: prompt }]);
    setQuestion('');
    try {
      const response = await clinicalRepository.request<ChatReply>('/api/ask-remotion/chat', { method: 'POST', signal: next.signal,
        body: JSON.stringify({ patientId, question: prompt, history, focusId, recordings: patientId ? [] : summarizeRecordings(recordings) }) });
      if (next.signal.aborted) return;
      const playable = response.evidence.filter(e => e.playable);
      if (playable.length) await onOpen(playable, next.signal);
      if (!next.signal.aborted) setMessages(current => [...current, { role: 'assistant', content: response.message + (response.evidence.some(e => !e.playable) ? ' The matching video is unavailable.' : '') }]);
    } catch (cause) { if (!next.signal.aborted) setError(cause instanceof Error ? cause.message : 'That recording could not be opened. Try again.'); }
    finally { if (!next.signal.aborted) setBusy(false); }
  }
  return <section className="ask-remotion" aria-label="Ask ReMotion">
    <h2>Ask ReMotion</h2>
    <div className="ask-remotion-messages" role="log" aria-label="Conversation with ReMotion" aria-live="polite" ref={log}>
      {messages.map((message, index) => <div key={index} className={`ask-remotion-message ask-remotion-message-${message.role}`}><span>{message.role === 'user' ? 'You' : 'ReMotion'}</span><p>{message.content}</p></div>)}
      {busy && <p role="status">Finding your recording…</p>}
    </div>
    <form onSubmit={event => { event.preventDefault(); void search(); }}>
      <label className="echo-sr-only" htmlFor="ask-remotion-question">Ask about recorded movements</label>
      <div className="ask-remotion-input"><input id="ask-remotion-question" autoComplete="off" value={question} maxLength={1000} onChange={e => setQuestion(e.target.value)} placeholder="Ask about a recording…" aria-label="Ask about recorded movements" onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void search(); }
      }}/></div>
    </form>
    {error && <p role="alert">{error}</p>}

  </section>;
}
