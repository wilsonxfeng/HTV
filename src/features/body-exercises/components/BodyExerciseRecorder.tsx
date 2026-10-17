import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Pause, Play, Square } from 'lucide-react';
const VoiceCoach=lazy(()=>import('../../../components/VoiceCoach'));
const PatientSyncPanel=lazy(()=>import('../../clinical-data/components/PatientSyncPanel'));
import { useApp } from '../../../lib/store';
import type { MotionSession, HandSide } from '../../../lib/types';
import { usePoseTracker } from '../../body-tracking/poseTracker';
import { PoseRecorder } from '../../body-tracking/poseRecorder';
import { bodyRecordingStore } from '../../body-tracking/bodyRecordingStore';
import { analyzeBodySession } from '../../body-tracking/poseMetrics';
import { toBodyEchoSession } from '../../body-echoes/BodyEchoAdapter';
import { echoRepository } from '../../movement-echoes/repository';
import { clinicalRepository, useClinicalAccess } from '../../clinical-data/access';
import type { ClinicalAccess } from '../../clinical-data/access';
import { recordingOutbox } from '../../clinical-data/outbox';
import { bodySessionMetadata } from '../../clinical-data/echoAdapter';
import { getExercise } from '../exerciseRegistry';
import BodyExerciseGuide from './BodyExerciseGuide';
import CameraFramingGuide from './CameraFramingGuide';
import '../../../components/exercise.css';
import './body-exercises.css';

export default function BodyExerciseRecorder({exerciseId,onBack,onComplete}: {exerciseId:string;onBack:()=>void;onComplete:(s:MotionSession)=>void}) {
  const exercise=getExercise(exerciseId);
  const [side,setSide]=useState<HandSide>('Right'),[target,setTarget]=useState(exercise.repetitionTarget),[state,setState]=useState<'setup'|'recording'|'paused'|'saving'|'save-error'>('setup');
  const [count,setCount]=useState(0),[seconds,setSeconds]=useState(0),[error,setError]=useState(''),[cue,setCue]=useState(`${exercise.setup} Which side are you exercising? Say left or right.`),[consent,setConsent]=useState(false);
  const tracker=usePoseTracker(exerciseId,side), active=useRef<PoseRecorder|null>(null), finishRef=useRef<(interrupted?:boolean)=>void>(()=>{}), sharing=useRef<ClinicalAccess|null>(null),saving=useRef(false),pending=useRef<Awaited<ReturnType<PoseRecorder['finish']>>|null>(null),interruptedByPain=useRef(false);
  const start=()=>{
    if(active.current||saving.current)return;
    try {
      if(!tracker.videoRef.current||!tracker.latestRef.current)throw Error('Enable the camera and hold your starting position.');
      active.current=new PoseRecorder(tracker.videoRef.current,tracker.latestRef.current,exerciseId,side,target);
      const access=useClinicalAccess.getState().access;sharing.current=consent&&access?.role==='patient'?{...access}:null;
      interruptedByPain.current=false;setState('recording');setCount(0);setError('');setCue(`${exercise.movement} Complete ${target} repetitions. Stop if uncomfortable.`);
    }catch(e){setError(e instanceof Error?e.message:'Recording could not start.');}
  };
  const pause=()=>{if(!active.current||saving.current)return;active.current.pause();setState('paused');setCue('Paused. Say resume when ready, or finish to save.');};
  const resume=()=>{if(!active.current||saving.current)return;active.current.resume();setState('recording');setCue(exercise.movement);};
  const finish=async(interrupted=false)=>{
    const recorder=active.current;if((!recorder&&!pending.current)||saving.current)return;
    saving.current=true;setState('saving');setError('');
    try {
      const result=pending.current??await recorder!.finish(interrupted||interruptedByPain.current);pending.current=result;active.current=null;
      const demonstration=sharing.current?.demonstration??false;
      // Atomically store the original video and all pose data before creating derived caches or uploading.
      await bodyRecordingStore.save({...result,demonstration});
      await echoRepository.save(toBodyEchoSession(result.motion,result.video,result.metadata,demonstration)).catch(()=>{});
      const access=sharing.current;
      if(access){
        await recordingOutbox.save(bodySessionMetadata(result.motion,result.metadata,access.patientId,access.demonstration),result.motion,result.video);
        if(useClinicalAccess.getState().access?.token===access.token)void recordingOutbox.sync(result.motion.id,clinicalRepository).then(saved=>{if(saved.state==='synced')void clinicalRepository.report(saved.id).catch(()=>{});});
      }
      pending.current=null;tracker.stop();onComplete(result.motion);
    }catch(e){setError(e instanceof Error?e.message:'Recording could not be saved.');setState(pending.current?'save-error':'setup');active.current=null;}
    finally{saving.current=false;}
  };
  finishRef.current=(interrupted)=>{void finish(interrupted);};
  useEffect(()=>{
    const timer=setInterval(()=>{
      const recorder=active.current;if(!recorder||recorder.paused||saving.current)return;
      recorder.sample(tracker.latestRef.current);const reps=analyzeBodySession(recorder.motion).repetitions;
      setCount(reps);setSeconds(recorder.elapsed);
      if(reps>=target||recorder.elapsed>=89.5)finishRef.current();
    },80);
    return()=>clearInterval(timer);
  },[target,tracker.latestRef]);
  useEffect(()=>()=>{
    const recorder=active.current;if(!recorder||saving.current)return;
    recorder.stop();void recorder.finish(true).then(async result=>{await bodyRecordingStore.save({...result,demonstration:sharing.current?.demonstration??false});await echoRepository.save(toBodyEchoSession(result.motion,result.video,result.metadata,sharing.current?.demonstration??false));await useApp.getState().save(result.motion);}).catch(()=>{});
  },[]);
  useEffect(()=>{const hidden=()=>{if(document.hidden)pause();};document.addEventListener('visibilitychange',hidden);return()=>document.removeEventListener('visibilitychange',hidden);},[]);
  const reply=(text:string)=>{
    const command=text.toLowerCase();
    if(/\b(pain|hurts?|painful|dizzy|uncomfortable|stop)\b/.test(command)){interruptedByPain.current=true;pause();setCue('Stop moving. Follow your clinician’s instructions before continuing. Finish to save this recording.');return 'Movement stopped. Recording paused.';}
    if(/\bpause\b/.test(command)){pause();return 'Paused.';}
    if(/\bfinish\b/.test(command)){void finish(true);return 'Saving the recorded movement.';}
    if(/\bresume\b/.test(command)){resume();return 'Recording resumed if a session was paused.';}
    if(state!=='setup')return 'Recording is active. Say pause or finish.';
    if(/\bleft\b/.test(command)){setSide('Left');setCue(`Left side selected. ${exercise.setup} Hold the starting position, then say begin.`);return 'Left side selected.';}
    if(/\bright\b/.test(command)){setSide('Right');setCue(`Right side selected. ${exercise.setup} Hold the starting position, then say begin.`);return 'Right side selected.';}
    if(/\b(camera|ready|retry)\b/.test(command)){if(tracker.status!=='ready')void tracker.start();setCue(`${exercise.setup} Hold your starting position, then say begin.`);return 'Position yourself in the camera guide.';}
    if(/\b(begin|start)\b/.test(command)){start();return active.current?'Recording started.':'Start blocked. Check the camera framing.';}
    return 'Say left, right, ready, begin, pause, resume, finish, or stop.';
  };
  const busy=state!=='setup';
  return <div className="body-practice page-enter"><button className="text-button" disabled={busy} onClick={onBack}><ArrowLeft size={20}/>Exercises</button><header><h1>{exercise.title}</h1>{exercise.experimental&&<span className="badge">Experimental · Video comparison</span>}</header>
    <Suspense fallback={<p>Loading coach…</p>}><VoiceCoach context={`Exercise: ${exercise.title}. ${exercise.setup} ${exercise.movement} Side: ${side}. State: ${state}. Confirmed repetitions: ${count} of ${target}. ${tracker.sample?.reason??''}. Trunk rotation degrees are never reported.`} cue={cue} commands="left, right, ready, begin, pause, resume, finish, retry camera, stop" onReply={reply} onConnection={connected=>{if(connected&&tracker.status==='off')void tracker.start();else if(!connected&&active.current&&!active.current.paused)pause();}}/></Suspense>
    <div className="body-recorder-layout"><section className="body-camera"><div className="body-camera-heading"><Camera size={20}/><strong>{state==='recording'?'Recording':state==='paused'?'Paused':'Camera'}</strong>{busy&&<span>{count}/{target} repetitions · {seconds.toFixed(0)}s</span>}</div><div className="body-video-stage"><video ref={tracker.videoRef} muted playsInline aria-label="Unmirrored body camera preview"/><CameraFramingGuide ready={!!tracker.sample?.tracking} message={tracker.status==='ready'?(tracker.sample?.reason??exercise.framing):exercise.framing}/>{tracker.status!=='ready'&&<button className="btn btn-primary body-enable-camera" disabled={tracker.status==='loading'||busy} onClick={()=>void tracker.start()}>{tracker.status==='loading'?'Loading camera…':tracker.status==='error'?'Retry camera':'Enable camera'}</button>}</div>
      <div className="body-record-controls">{state==='setup'?<button className="btn btn-primary" disabled={!tracker.sample?.tracking} onClick={start}><Play size={20}/>Start recording</button>:<><button className="btn btn-secondary" disabled={state==='saving'||state==='save-error'} onClick={state==='paused'?resume:pause}>{state==='paused'?<Play size={20}/>:<Pause size={20}/>} {state==='paused'?'Resume':'Pause'}</button><button className="btn btn-primary" disabled={state==='saving'} onClick={()=>void finish()}><Square size={18}/>{state==='saving'?'Saving…':state==='save-error'?'Retry saving':'Finish'}</button></>}</div></section>
      <aside className="body-setup"><div className="body-settings"><label>Side<select disabled={busy} value={side} onChange={e=>setSide(e.target.value as HandSide)}><option>Right</option><option>Left</option></select></label><label>Repetitions<select disabled={busy} value={target} onChange={e=>setTarget(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label></div><BodyExerciseGuide exercise={exercise}/><p className="body-limit">Follow your prescribed range. Stop if uncomfortable.</p><Suspense fallback={null}><PatientSyncPanel consent={consent} onConsent={setConsent} disabled={busy} notice="" version={0}/></Suspense></aside></div>
    {(error||tracker.error)&&<p className="clinical-error" role="alert">{error||tracker.error}</p>}
  </div>;
}
