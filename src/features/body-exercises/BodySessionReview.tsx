import { useEffect, useState } from 'react';
import type { MotionSession } from '../../lib/types';
import { useApp } from '../../lib/store';
import MovementEchoes from '../movement-echoes/MovementEchoes';
import { echoRepository } from '../movement-echoes/repository';
import { compatible } from '../movement-echoes/geometry';
import type { EchoSession } from '../movement-echoes/types';
import { bodyRecordingStore } from '../body-tracking/bodyRecordingStore';
import { toBodyEchoSession } from '../body-echoes/BodyEchoAdapter';
import { analyzeBodySession } from '../body-tracking/poseMetrics';
import { getExercise } from './exerciseRegistry';
import './components/body-exercises.css';
export default function BodySessionReview({session}: {session: MotionSession}) {
  const [recordings,setRecordings]=useState<EchoSession[]|null>(null),[error,setError]=useState('');
  const navigate=useApp(s=>s.navigate),analysis=analyzeBodySession(session),exercise=getExercise(session.exerciseId);
  useEffect(()=>{let live=true;void (async()=>{
    const [stored,derived]=await Promise.all([bodyRecordingStore.list(),echoRepository.list()]);
    const normalized=stored.map(r=>derived.find(d=>d.id===r.motion.id)??toBodyEchoSession(r.motion,r.video,r.metadata,r.demonstration));
    const focus=normalized.find(s=>s.id===session.id);if(!focus)throw Error('The video is no longer stored on this device.');
    const group=[focus,...normalized.filter(s=>s.id!==focus.id&&compatible(focus,s)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,3)];
    if(live)setRecordings(group);
  })().catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[session.id]);
  return <div><div className="body-practice" style={{paddingBottom:0}}><h1>{exercise.title}</h1><div className="body-review-metrics"><span><strong>{analysis.body?.primaryValue?.toFixed(1)??'—'}{exercise.unit}</strong>{exercise.primaryMetric}</span><span><strong>{analysis.repetitions}</strong>Detected repetitions</span><span><strong>{Math.round(analysis.trackingQuality)}%</strong>Tracked time</span><p>{exercise.experimental?'Experimental orientation; use the video for comparison.':'Estimated from the camera; not a clinical assessment.'}</p></div>{error&&<><p role="alert">{error}</p><button className="btn btn-secondary" onClick={()=>navigate('exercise')}>New recording</button></>}</div>{recordings?<MovementEchoes key={session.id} sessions={recordings} initialFocusedSessionId={session.id} providedOnly cacheLocally backLabel="Back to Progress" onClose={()=>navigate('progress')}/>:!error&&<p role="status">Opening recording…</p>}</div>;
}
