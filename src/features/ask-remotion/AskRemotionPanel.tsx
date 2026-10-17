import { useEffect, useRef, useState } from 'react';
import { getExercise } from '../body-exercises/exerciseRegistry';
import { clinicalRepository } from '../clinical-data/access';
import type { Evidence, SearchPreset, SearchResult } from './contracts';
import './ask-remotion.css';
const suggestions: {preset:SearchPreset;label:string}[] = [{preset:'greatest-finger',label:'Greatest finger opening'},{preset:'first-latest-finger',label:'First vs. latest finger opening'},{preset:'smallest-knee',label:'Smallest knee-extension range'}];
export default function AskRemotionPanel({patientId,exerciseId,side,onOpen,enabled=true}:{enabled?:boolean;patientId:string;exerciseId:string;side:'Left'|'Right';onOpen:(evidence:Evidence[],signal:AbortSignal)=>Promise<void>}) {
  const [question,setQuestion]=useState(''),[result,setResult]=useState<SearchResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
  const [context,setContext]=useState({exerciseId,side});
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{controller.current?.abort();setResult(null);setError('');setBusy('');setContext({exerciseId,side});return()=>controller.current?.abort();},[patientId,exerciseId,side,enabled]);
  async function open(evidence:Evidence[],signal:AbortSignal) {if(signal.aborted)return;setBusy('Opening recording…');await onOpen(evidence,signal);}
  async function search(preset?:SearchPreset) {
    if(!enabled)return;
    controller.current?.abort();const next=new AbortController();controller.current=next;setError('');setResult(null);setBusy('Searching movement history…');
    try {
      const response=await clinicalRepository.request<SearchResult>('/api/ask-remotion',{method:'POST',signal:next.signal,body:JSON.stringify({patientId,question:preset?suggestions.find(s=>s.preset===preset)!.label:question,exerciseContext:context,...(preset?{preset}:{})})});
      if(next.signal.aborted)return;setResult(response);
      if(response.evidence[0])setContext({exerciseId:response.evidence[0].exerciseId,side:response.evidence[0].side});
      if(response.evidence.length===1 && response.evidence[0].playable) await open(response.evidence,next.signal);
    } catch(cause) {if(!next.signal.aborted)setError(cause instanceof Error?cause.message:'Search unavailable.');}
    finally {if(!next.signal.aborted)setBusy('');}
  }
  async function view(evidence:Evidence[]) {controller.current?.abort();const next=new AbortController();controller.current=next;setError('');try{await open(evidence,next.signal);}catch(cause){if(!next.signal.aborted)setError(cause instanceof Error?cause.message:'Recording unavailable.');}finally{if(!next.signal.aborted)setBusy('');}}
  return <section className="ask-remotion" aria-label="Ask ReMotion"><div><h2>Ask ReMotion</h2></div>{!enabled&&<p>Connect synced history to search recordings.</p>}<form onSubmit={event=>{event.preventDefault();void search();}}><label htmlFor="ask-remotion-question">Ask about recorded movements</label><div className="ask-remotion-input"><input id="ask-remotion-question" disabled={!enabled} value={question} maxLength={1000} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about movement history…"/><button disabled={!enabled||!question.trim()} type="submit">Search</button></div></form><div className="ask-remotion-suggestions">{suggestions.map(s=><button key={s.preset} disabled={!enabled} onClick={()=>void search(s.preset)}>{s.label}</button>)}</div>{busy&&<p role="status">{busy}</p>}{error&&<p role="alert">{error}</p>}{result&&<div aria-live="polite"><small>{result.source==='gemini'?'Gemini interpreted your question':'Suggested search'}</small><p>{result.message}</p><small>{result.metricLabel}</small><div className="ask-remotion-evidence">{result.evidence.map(e=><article key={e.sessionId}><strong>{new Date(e.recordedAt).toLocaleString()}</strong><p>{e.metricValue.toFixed(1)}{e.metricUnit} · {e.qualityStatus}</p><p>{e.repetitionIndex===null?'Session measurement':`Repetition ${e.repetitionIndex+1}`} · {e.timestampMs===null?'Exact timestamp unavailable':`${(e.timestampMs/1000).toFixed(2)}s`}</p><button disabled={!e.playable} onClick={()=>void view([e])}>{e.playable?'View recording':'No recording available'}</button></article>)}</div>{result.evidence.length===2&&<button disabled={result.evidence.some(e=>!e.playable)} onClick={()=>void view(result.evidence)}>Compare in Movement Echoes</button>}</div>}<small>{context.side} side · {getExercise(context.exerciseId).title} · Recorded camera estimates</small></section>;
}
