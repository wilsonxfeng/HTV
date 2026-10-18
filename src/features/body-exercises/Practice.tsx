import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import ExerciseFlow from '../../components/ExerciseFlow';
import BodyExerciseRecorder from './components/BodyExerciseRecorder';
import { exerciseRegistry, getExercise } from './exerciseRegistry';
import type { MotionSession } from '../../lib/types';
import './components/body-exercises.css';
export default function Practice({onBack,onComplete,onRecorded}:{onRecorded?:(s:MotionSession)=>void;onBack:()=>void;onComplete:(s:MotionSession)=>void}) {
  const [selected,setSelected]=useState('finger-spread-close'),[started,setStarted]=useState(false);
  const exercise=getExercise(selected);
  if(started)return exercise.trackingMode==='hand'?<ExerciseFlow onRecorded={onRecorded} onBack={()=>setStarted(false)} onComplete={onComplete}/>:<BodyExerciseRecorder exerciseId={selected} onBack={()=>setStarted(false)} onComplete={s=>{onRecorded?.(s);onComplete(s)}}/>;
  return <div className="body-practice body-chooser page-enter"><button className="text-button" onClick={onBack}><ArrowLeft size={20}/>Home</button><h1>Choose your exercise</h1><label htmlFor="practice-exercise">Exercise</label><select id="practice-exercise" value={selected} onChange={e=>setSelected(e.target.value)}>{exerciseRegistry.map(e=><option key={e.id} value={e.id}>{e.title}{e.experimental?' · Experimental':''}</option>)}</select><p>{exercise.setup}</p><button className="btn btn-primary" onClick={()=>setStarted(true)}>Continue<ArrowRight size={20}/></button></div>;
}
