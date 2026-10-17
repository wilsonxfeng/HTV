import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Vec3 } from '../../lib/types';
export interface TrackingDetection { image:Vec3[][];world:Vec3[][];handedness:{label:string;score:number}[] }
export interface TrackingAdapter { mode:'hand'|'pose';detect(input:HTMLVideoElement|HTMLCanvasElement,timestampMs:number):TrackingDetection;close():void }
const copy=(p:Vec3)=>({x:p.x,y:p.y,z:p.z,...(p.visibility!==undefined?{visibility:p.visibility}:{}),...(p.presence!==undefined?{presence:p.presence}:{})});
export async function createTrackingAdapter(mode:'hand'|'pose'):Promise<TrackingAdapter> {
  const files=await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`);
  if(mode==='hand') {
    const model=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:`${import.meta.env.BASE_URL}models/hand_landmarker.task`,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6});
    return {mode,detect(input,timestampMs){const r=model.detectForVideo(input,timestampMs);return {image:r.landmarks.map(v=>v.map(copy)),world:r.worldLandmarks.map(v=>v.map(copy)),handedness:r.handedness.map(v=>({label:v[0]?.categoryName??'',score:v[0]?.score??0}))};},close:()=>model.close()};
  }
  const model=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:`${import.meta.env.BASE_URL}models/pose_landmarker_full.task`,delegate:'CPU'},runningMode:'VIDEO',numPoses:2,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6,outputSegmentationMasks:false});
  return {mode,detect(input,timestampMs){const r=model.detectForVideo(input,timestampMs);try{return {image:r.landmarks.map(v=>v.map(copy)),world:r.worldLandmarks.map(v=>v.map(copy)),handedness:[]};}finally{r.close();}},close:()=>model.close()};
}
