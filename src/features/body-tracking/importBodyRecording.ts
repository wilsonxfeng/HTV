import { createTrackingAdapter } from './trackingAdapter';
import { poseIsVisible, bodySignal } from './poseMetrics';
import { getExercise, BODY_ANALYSIS_VERSION, BODY_SEGMENTATION_VERSION } from '../body-exercises/exerciseRegistry';
import { loadVideo, seekVideo, checkAbort } from '../movement-echoes/video';
import { videoHash } from '../clinical-data/capture';
import type { HandFrame, HandSide, MotionSession } from '../../lib/types';
import type { BodyRecording } from './bodyRecordingStore';
import type { ProcessingUpdate } from '../movement-echoes/types';

export async function importBodyRecording(video: Blob, options: {id?: string; exerciseId: string; side: HandSide; name: string; demonstration: boolean}, update: (u: ProcessingUpdate)=>void, signal?: AbortSignal): Promise<BodyRecording> {
  const loaded=await loadVideo(video,signal), exercise=getExercise(options.exerciseId);
  let tracker:Awaited<ReturnType<typeof createTrackingAdapter>>|undefined;
  try {
    if(!Number.isFinite(loaded.video.duration)||loaded.video.duration<.6||loaded.video.duration>90)throw Error('Choose a recording between 1 and 90 seconds.');
    tracker=await createTrackingAdapter('pose');
    const frames:HandFrame[]=[],duration=loaded.video.duration,total=Math.ceil(duration*12);
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.round(640*loaded.video.videoHeight/loaded.video.videoWidth);const ctx=canvas.getContext('2d')!;
    for(let i=0;i<total;i++){
      checkAbort(signal);const t=i/12;await seekVideo(loaded.video,t,signal);ctx.drawImage(loaded.video,0,0,canvas.width,canvas.height);
      const detected=tracker.detect(canvas,t*1000+1),image=detected.image[0]??[],world=detected.world[0]??[];
      const tracking=detected.image.length===1&&poseIsVisible(image,world,exercise.id,options.side);
      frames.push({t,tracking,landmarks:tracking?world:[],imageLandmarks:image.length===33?image:undefined,worldLandmarks:world.length===33?world:undefined,confidence:tracking?Math.min(...exercise.trackedLandmarks(options.side).map(j=>image[j].visibility??0)):0});
      update({stage:'Tracking recorded movement',sessionName:options.name,completed:i+1,total});await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    const baseline=frames.find(f=>f.tracking);if(!baseline)throw Error('The selected side could not be tracked. Check side and framing.');
    const now=new Date().toISOString();
    const motion:MotionSession={id:options.id??crypto.randomUUID(),createdAt:now,exerciseId:exercise.id,hand:options.side,targetSide:options.side,trackingMode:'pose',bodyRegion:exercise.bodyRegion,cameraView:exercise.cameraView,analysisVersion:BODY_ANALYSIS_VERSION,segmentationCacheVersion:BODY_SEGMENTATION_VERSION,source:'camera',completed:false,duration,cycleDuration:8,repetitionTarget:3,frames,calibration:{neutral:baseline.worldLandmarks!,target:baseline.worldLandmarks!,imageNeutral:baseline.imageLandmarks!,hand:options.side,source:'personal',createdAt:now}};
    if(!bodySignal(motion).some(f=>f.value!==null))throw Error('No measurable movement in this video.');
    return {motion,video,demonstration:options.demonstration,metadata:{mimeType:video.type||'video/mp4',sha256:await videoHash(video),sizeBytes:video.size,width:loaded.video.videoWidth,height:loaded.video.videoHeight,durationMs:duration*1000,landmarkOffsetMs:0,mirrored:false}};
  } finally {tracker?.close();loaded.release();}
}
