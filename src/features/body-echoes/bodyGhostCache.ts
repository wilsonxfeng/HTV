import { baselineAnchors } from './bodyAlignment';
import { createBodySegmenter } from './bodySegmentation';
import { BODY_SEGMENTATION_VERSION,getExercise } from '../body-exercises/exerciseRegistry';
import { echoRepository } from '../movement-echoes/repository';
import { frameAtTime,phaseToTime } from '../movement-echoes/geometry';
import { canvasBlob,checkAbort,loadVideo,seekVideo } from '../movement-echoes/video';
import type { EchoSession,GhostCache,ProcessingUpdate,SegmentationConfig } from '../movement-echoes/types';
export async function buildBodyGhostCache(session:EchoSession,repetitionIndex:number,config:SegmentationConfig,update:(u:ProcessingUpdate)=>void,signal?:AbortSignal,force=false,persist=true):Promise<GhostCache> {
  const rep=session.repetitions[repetitionIndex];
  if(!rep?.valid)throw Error('Choose or mark a complete repetition.');
  const key=JSON.stringify([session.id,session.sourceFingerprint,rep,config,BODY_SEGMENTATION_VERSION,session.baselineImage,session.cameraView]);
  if(persist&&!force){const cached=await echoRepository.cache(key);if(cached)return cached;}
  const loaded=await loadVideo(session.video,signal);
  let segmenter:Awaited<ReturnType<typeof createBodySegmenter>>|undefined;
  try{
    segmenter=await createBodySegmenter();checkAbort(signal);
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.round(640*session.videoHeight/session.videoWidth);
    const anchors=baselineAnchors(session,canvas.width,canvas.height);if(!anchors)throw Error('A visible seated baseline is needed to align these recordings.');
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!,frames:GhostCache['frames']=[],exercise=getExercise(session.exerciseId);
    for(let i=0;i<config.sampleCount;i++){
      checkAbort(signal);const phase=i/(config.sampleCount-1),tMs=phaseToTime(phase,rep),tracked=frameAtTime(session.frames,tMs-session.landmarkOffsetMs);
      if(tracked){
        await seekVideo(loaded.video,tMs/1000,signal);ctx.drawImage(loaded.video,0,0,canvas.width,canvas.height);
        try{
          const required=exercise.trackedLandmarks(session.selectedHand==='Left'?'Left':'Right').map(j=>tracked.image[j]);
          const quality=segmenter.segment(canvas,required);
          frames.push({phase,tMs,image:await canvasBlob(canvas),width:canvas.width,height:canvas.height,anchors,quality});
        }catch{ /* An unavailable mask stays a gap; never substitute a drawn body. */ }
      }
      update({stage:'Extracting recorded person',completed:i+1,total:config.sampleCount,sessionName:session.name});
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    if(!frames.some(f=>f.quality.valid))throw Error('No reliable person outlines. Replay the original video or retry with clearer framing.');
    const cache={key,sessionId:session.id,repetitionIndex,version:BODY_SEGMENTATION_VERSION,config,frames,sourceFingerprint:session.sourceFingerprint};
    if(persist)await echoRepository.saveCache(cache);return cache;
  }finally{segmenter?.close();loaded.release();}
}
