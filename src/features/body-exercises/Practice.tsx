import { useState } from 'react';
import { ArrowLeft, ArrowRight, Hand, RotateCcw } from 'lucide-react';
import ExerciseFlow from '../../components/ExerciseFlow';
import { BicepCurlIcon, KneeExtensionIcon } from './components/ExerciseIcons';
import BodyExerciseRecorder from './components/BodyExerciseRecorder';
import { exerciseRegistry, getExercise } from './exerciseRegistry';
import type { MotionSession } from '../../lib/types';
import './components/body-exercises.css';
export default function Practice({onBack,onComplete,onRecorded}:{onRecorded?:(s:MotionSession)=>void;onBack:()=>void;onComplete:(s:MotionSession)=>void}) {
  const [selected,setSelected]=useState('finger-spread-close'),[started,setStarted]=useState(false);
  const exercise=getExercise(selected);
  if(started)return exercise.trackingMode==='hand'?<ExerciseFlow onRecorded={onRecorded} onBack={()=>setStarted(false)} onComplete={onComplete}/>:<BodyExerciseRecorder exerciseId={selected} onBack={()=>setStarted(false)} onComplete={s=>{onRecorded?.(s);onComplete(s)}}/>;
  const icons = { hand: Hand, leg: KneeExtensionIcon, arm: BicepCurlIcon, core: RotateCcw };
  return <div className="body-practice body-chooser page-enter">
    <button className="text-button" onClick={onBack}><ArrowLeft size={20}/>Home</button>
    <div className="practice-intro"><h1>Choose your exercise</h1><p>Choose a movement. Your voice coach will guide you through it.</p></div>
    <fieldset className="exercise-options"><legend>Exercise</legend><div className="exercise-option-grid">
      {exerciseRegistry.map(item => { const Icon = icons[item.bodyRegion]; return <label key={item.id} className={`exercise-option ${selected === item.id ? 'is-selected' : ''}`}>
        <input type="radio" name="practice-exercise" value={item.id} checked={selected === item.id} onChange={() => setSelected(item.id)}/>
        <span className="exercise-option-icon"><Icon size={28}/></span>
        <span className="exercise-option-copy"><strong>{item.title}</strong>{item.experimental && <span className="exercise-experimental">Experimental</span>}<span>{item.movement}</span></span>
        <span className="exercise-option-indicator" aria-hidden="true"/>
      </label>; })}
    </div></fieldset>
    <section className="practice-selection-footer" aria-label="Selected exercise setup"><div><h2>Before you begin</h2><p>{exercise.setup}</p></div><button className="btn btn-primary" onClick={()=>setStarted(true)}>Continue<ArrowRight size={20}/></button></section>
  </div>;
}
