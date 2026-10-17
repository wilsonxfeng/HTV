import { lazy, Suspense, useState } from 'react';
import { loadKneeDemo } from './bodyDemo';
import type { EchoSession } from '../movement-echoes/types';
const MovementEchoes=lazy(()=>import('../movement-echoes/MovementEchoes'));
import { ArrowLeft, ArrowRight } from 'lucide-react';
import ExerciseFlow from '../../components/ExerciseFlow';
import BodyExerciseRecorder from './components/BodyExerciseRecorder';
import { exerciseRegistry, getExercise } from './exerciseRegistry';
import type { MotionSession } from '../../lib/types';
import './components/body-exercises.css';
export default function Practice({onBack,onComplete}:{onBack:()=>void;onComplete:(s:MotionSession)=>void}) {
  const [selected,setSelected]=useState('finger-spread-close'),[started,setStarted]=useState(false);
  const [demo,setDemo]=useState<EchoSession[]|null>(null),[loading,setLoading]=useState(''),[error,setError]=useState('');
  const exercise=getExercise(selected);
  if(demo)return <Suspense fallback={<p>Opening recordings…</p>}><MovementEchoes providedOnly cacheLocally backLabel="Back to exercises" sessions={demo} onClose={()=>setDemo(null)}/></Suspense>;
  if(started)return exercise.trackingMode==='hand'?<ExerciseFlow onBack={()=>setStarted(false)} onComplete={onComplete}/>:<BodyExerciseRecorder exerciseId={selected} onBack={()=>setStarted(false)} onComplete={onComplete}/>;
  return <div className="body-practice body-chooser page-enter"><button className="text-button" onClick={onBack}><ArrowLeft size={20}/>Home</button><h1>Choose your exercise</h1><label htmlFor="practice-exercise">Exercise</label><select id="practice-exercise" value={selected} onChange={e=>setSelected(e.target.value)}>{exerciseRegistry.map(e=><option key={e.id} value={e.id}>{e.title}{e.experimental?' · Experimental':''}</option>)}</select><p>{exercise.setup}</p><button className="btn btn-primary" onClick={()=>setStarted(true)}>Continue<ArrowRight size={20}/></button><button className="btn btn-secondary full" style={{marginTop:16}} disabled={!!loading} onClick={()=>{setLoading('Opening knee demo…');setError('');void loadKneeDemo(u=>setLoading(u.stage)).then(setDemo).catch(e=>setError(e.message)).finally(()=>setLoading(''));}}>{loading||'Watch knee video demo'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
