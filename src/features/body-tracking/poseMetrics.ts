import type { HandFrame, HandSide, MotionSession, SessionAnalysis, Vec3 } from '../../lib/types';
import { getExercise } from '../body-exercises/exerciseRegistry';
import { detectBodyRepetitions } from '../body-exercises/repetitionDetection';

export function jointAngle(a:Vec3,b:Vec3,c:Vec3):number|null {
  const u={x:a.x-b.x,y:a.y-b.y,z:a.z-b.z},v={x:c.x-b.x,y:c.y-b.y,z:c.z-b.z};
  const denominator=Math.hypot(u.x,u.y,u.z)*Math.hypot(v.x,v.y,v.z);
  if(denominator<1e-8)return null;
  return Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y+u.z*v.z)/denominator)))*180/Math.PI;
}
export function poseIsVisible(image:Vec3[],world:Vec3[],exerciseId:string,side:HandSide) {
  return image.length===33 && world.length===33 && getExercise(exerciseId).trackedLandmarks(side).every(i=>{
    const p=image[i],w=world[i];
    return p && w && [p.x,p.y,p.z,w.x,w.y,w.z].every(Number.isFinite) && (p.visibility??0)>=.6 && (p.presence??1)>=.5 && p.x>.015&&p.x<.985&&p.y>.015&&p.y<.985;
  });
}
/** Joint angles use estimated world coordinates. Trunk yaw is only an internal phase signal. */
export function poseValue(points:Vec3[],exerciseId:string,side:HandSide,baseline?:Vec3[]):number|null {
  if(points.length!==33)return null;
  const left=side==='Left',exercise=getExercise(exerciseId);
  if(exercise.phaseDetector==='extension')return jointAngle(points[left?23:24],points[left?25:26],points[left?27:28]);
  if(exercise.phaseDetector==='flexion') {const angle=jointAngle(points[left?11:12],points[left?13:14],points[left?15:16]);return angle===null?null:180-angle;}
  if(exercise.phaseDetector==='rotation' && baseline?.length===33) {
    const yaw=(p:Vec3[])=>Math.atan2(p[12].z-p[11].z,p[12].x-p[11].x)-Math.atan2(p[24].z-p[23].z,p[24].x-p[23].x);
    const delta=yaw(points)-yaw(baseline);
    return Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta))); // radians, never exposed as validated ROM
  }
  return null;
}
export function bodySignal(session:MotionSession,offsetMs=0) {
  return session.frames.map(f=>{
    const value=f.tracking?poseValue(f.worldLandmarks??f.landmarks,session.exerciseId!,session.hand,session.calibration.neutral):null;
    return {tMs:f.t*1000+offsetMs,value,valid:f.tracking&&value!==null&&Number.isFinite(value)};
  });
}
export function analyzeBodySession(session:MotionSession):SessionAnalysis {
  const exercise=getExercise(session.exerciseId),signal=bodySignal(session);
  const values=signal.flatMap(f=>f.valid&&f.value!==null?[f.value]:[]);
  const reps=detectBodyRepetitions(signal,exercise.phaseDetector==='rotation'?.12:8);
  let covered=0;
  for(let i=1;i<signal.length;i++)if(signal[i].valid&&signal[i-1].valid&&signal[i].tMs-signal[i-1].tMs<=300)covered+=signal[i].tMs-signal[i-1].tMs;
  const neutral=poseValue(session.calibration.neutral,exercise.id,session.hand,session.calibration.neutral);
  const max=values.length?Math.max(...values):null,min=values.length?Math.min(...values):null;
  const range=max!==null&&min!==null?max-min:null;
  const left=session.hand==='Left',anchor=left?23:24,distal=exercise.bodyRegion==='leg'?(left?27:28):(left?13:14),shoulder=left?11:12;
  const base=session.calibration.neutral,scale=base[anchor]&&base[shoulder]?Math.hypot(base[anchor].x-base[shoulder].x,base[anchor].y-base[shoulder].y,base[anchor].z-base[shoulder].z):0;
  const displacement=(f:HandFrame)=>{const p=f.worldLandmarks??f.landmarks;return Math.hypot((p[distal].x-p[anchor].x)-(base[distal].x-base[anchor].x),(p[distal].y-p[anchor].y)-(base[distal].y-base[anchor].y),(p[distal].z-p[anchor].z)-(base[distal].z-base[anchor].z))/scale;};
  const valid=session.frames.filter(f=>f.tracking&&(f.worldLandmarks??f.landmarks).length===33);
  return {pairs:[],deviations:[],targetAttainment:null,trackingQuality:Math.min(100,covered/Math.max(1,session.duration*1000)*100),validFrames:values.length,repetitions:reps.length,body:{primaryLabel:exercise.primaryMetric,primaryValue:exercise.experimental?null:exercise.bodyRegion==='leg'?max:range,unit:exercise.unit,neutralAngle:exercise.experimental?null:neutral,maximumAngle:exercise.experimental?null:max,movementRange:exercise.experimental?null:range,extensionFromNeutral:!exercise.experimental&&max!==null&&neutral!==null?max-neutral:null,relativeDisplacement:!exercise.experimental&&scale>.05&&valid.length?Math.max(...valid.map(displacement)):null,timeToPeakSeconds:reps.length?reps.reduce((sum,r)=>sum+(r.peakMs-r.startMs)/1000,0)/reps.length:null,movementDurationSeconds:session.duration,experimental:!!exercise.experimental,limitations:['Webcam estimates; not clinical joint measurements.','Camera viewpoint, occlusion and depth estimation affect comparison.',...(exercise.experimental?['Trunk orientation is experimental; no rotation degrees are reported.']:[])]}};
}
