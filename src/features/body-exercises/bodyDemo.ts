import type { BodyRecording } from '../body-tracking/bodyRecordingStore';
import { bodyRecordingStore } from '../body-tracking/bodyRecordingStore';
import { importBodyRecording } from '../body-tracking/importBodyRecording';
import { toBodyEchoSession } from '../body-echoes/BodyEchoAdapter';
import { echoRepository } from '../movement-echoes/repository';
import type { EchoSession, GhostCache, GhostFrame, ProcessingUpdate } from '../movement-echoes/types';
import { videoHash } from '../clinical-data/capture';
import { BODY_ANALYSIS_VERSION, BODY_SEGMENTATION_VERSION } from './exerciseRegistry';

const clips=[{id:'4ddfbc3f-680c-4e58-8b54-8f0ca9247601',file:'leg curl low ROM.mov',name:'Knee demo A'},{id:'4ddfbc3f-680c-4e58-8b54-8f0ca9247602',file:'leg curl high ROM.mov',name:'Knee demo B'}];
type Prepared={recordings:Omit<BodyRecording,'video'>[];sessions:Omit<EchoSession,'video'>[];caches:(Omit<GhostCache,'frames'>&{frames:(Omit<GhostFrame,'image'>&{file:string})[]})[]};
/** Consenting team footage. Filenames never determine measured values or imply recovery. */
export async function loadKneeDemo(update:(u:ProcessingUpdate)=>void,signal?:AbortSignal):Promise<EchoSession[]> {
  const base=`${import.meta.env.BASE_URL}demo%20recordings/`,saved=await echoRepository.list(),sessions:EchoSession[]=[];
  let prepared:Prepared|null=null;
  try {const response=await fetch(`${base}body-prepared/manifest.json`,{signal});if(response.ok)prepared=await response.json() as Prepared;}catch {if(signal?.aborted)throw new DOMException('Cancelled','AbortError');}
  for(const [i,clip] of clips.entries()){
    update({stage:'Loading knee recordings',completed:i,total:2,sessionName:clip.name});
    const response=await fetch(`${base}${encodeURIComponent(clip.file)}`,{signal});if(!response.ok)throw Error('The supplied knee video is unavailable.');
    const video=new Blob([await response.blob()],{type:'video/mp4'}),hash=await videoHash(video);
    const existing=saved.find(s=>s.id===clip.id&&s.sourceFingerprint===hash&&s.analysisVersion===BODY_ANALYSIS_VERSION);
    if(existing){sessions.push(existing);continue;}
    const record=prepared?.recordings[i],cache=prepared?.caches[i],normalized=prepared?.sessions[i];
    let session:EchoSession;
    if(record?.metadata.sha256===hash&&normalized?.analysisVersion===BODY_ANALYSIS_VERSION&&cache?.version===BODY_SEGMENTATION_VERSION){
      session={...normalized,video};await bodyRecordingStore.save({...record,video});
      const frames=await Promise.all(cache.frames.map(async({file,...frame})=>{const r=await fetch(`${base}body-prepared/${encodeURIComponent(file)}`,{signal});if(!r.ok)throw Error('A prepared person outline is missing.');return {...frame,image:await r.blob()};}));
      await echoRepository.saveCache({...cache,frames});
    }else{
      const record=await importBodyRecording(video,{id:clip.id,exerciseId:'seated-knee-extension',side:'Right',name:clip.name,demonstration:true},update,signal);
      await bodyRecordingStore.save(record);session=toBodyEchoSession(record.motion,video,record.metadata,true);session.name=clip.name;
    }
    await echoRepository.save(session);sessions.push(session);
  }
  return sessions;
}
