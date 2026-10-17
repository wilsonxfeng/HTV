import { useCallback,useEffect,useRef,useState } from 'react';
import { createTrackingAdapter } from './trackingAdapter';
import type { TrackingAdapter } from './trackingAdapter';
import { poseIsVisible } from './poseMetrics';
import { getExercise } from '../body-exercises/exerciseRegistry';
import type { HandFrame,HandSide } from '../../lib/types';
export interface PoseSample extends HandFrame {observedAt:number;reason:string}
export function usePoseTracker(exerciseId:string,side:HandSide) {
  const videoRef=useRef<HTMLVideoElement>(null),latestRef=useRef<PoseSample|null>(null);
  const model=useRef<TrackingAdapter|null>(null),stream=useRef<MediaStream|null>(null),run=useRef(0),raf=useRef(0);
  const options=useRef({exerciseId,side});options.current={exerciseId,side};
  const [status,setStatus]=useState<'off'|'loading'|'ready'|'error'>('off'),[sample,setSample]=useState<PoseSample|null>(null),[error,setError]=useState(''),[fps,setFps]=useState(0);
  const release=useCallback(()=>{run.current++;cancelAnimationFrame(raf.current);model.current?.close();model.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;latestRef.current=null;if(videoRef.current)videoRef.current.srcObject=null;},[]);
  const stop=useCallback(()=>{release();setSample(null);setStatus('off');},[release]);
  const start=useCallback(async()=>{
    release();const generation=run.current;setStatus('loading');setError('');
    let opening:MediaStream|undefined,detector:TrackingAdapter|undefined;
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Use a camera-enabled browser on localhost or HTTPS.');
      opening=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:720}},audio:false});
      if(run.current!==generation){opening.getTracks().forEach(t=>t.stop());return;}
      stream.current=opening;
      detector=await createTrackingAdapter('pose');
      if(run.current!==generation){detector.close();opening.getTracks().forEach(t=>t.stop());return;}
      model.current=detector;
      const video=videoRef.current;if(!video)throw Error('Camera preview is unavailable.');
      video.srcObject=opening;await video.play();if(run.current!==generation)return;
      opening.getVideoTracks().forEach(t=>t.onended=()=>{if(run.current===generation){release();setError('Camera disconnected. Finish or retry the recording.');setStatus('error');}});
      setStatus('ready');let last=0,lastVideo=-1,interval=1000/12,count=0,fpsStart=performance.now();
      const tick=(now:number)=>{
        if(run.current!==generation)return;
        if(video.readyState>=2&&video.currentTime!==lastVideo&&now-last>=interval){
          last=now;lastVideo=video.currentTime;
          try{
            const before=performance.now(),result=detector!.detect(video,now),{exerciseId,side}=options.current;
            interval=Math.max(1000/15,Math.min(200,(performance.now()-before)*1.3+10));
            const image=result.image[0]??[],world=result.world[0]??[],single=result.image.length===1;
            const tracking=single&&poseIsVisible(image,world,exerciseId,side);
            const required=getExercise(exerciseId).trackedLandmarks(side),confidence=required.length&&image.length===33?Math.min(...required.map(i=>image[i].visibility??0)):0;
            const reason=result.image.length>1?'Keep one person in view.':tracking?'Ready':getExercise(exerciseId).framing;
            const next:PoseSample={t:0,observedAt:now,tracking,landmarks:tracking?world:[],worldLandmarks:world.length===33?world:undefined,imageLandmarks:image.length===33?image:undefined,confidence,reason};
            latestRef.current=next;setSample(next);count++;
            if(now-fpsStart>1000){setFps(Math.round(count*1000/(now-fpsStart)));count=0;fpsStart=now;}
          }catch{release();setStatus('error');setError('Pose tracking stopped. Retry the camera.');return;}
        }
        raf.current=requestAnimationFrame(tick);
      };raf.current=requestAnimationFrame(tick);
    }catch(e){opening?.getTracks().forEach(t=>t.stop());if(run.current!==generation){detector?.close();return;}release();setStatus('error');setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Allow camera access, then retry.':e instanceof Error?e.message:'Camera unavailable.');}
  },[release]);
  useEffect(()=>()=>release(),[release]);
  return {videoRef,latestRef,sample,status,error,fps,start,stop};
}
