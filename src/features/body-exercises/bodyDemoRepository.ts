import { loadKneeDemo } from './bodyDemo';
import { bodyRecordingStore } from '../body-tracking/bodyRecordingStore';
import { analyzeBodySession } from '../body-tracking/poseMetrics';
import { bodySessionMetadata } from '../clinical-data/echoAdapter';
import type { SessionDetail, SessionRepository } from '../clinical-data/contracts';
const patientId='526d8109-a4f4-445a-a583-d146d8d53c72';
let pending:Promise<SessionDetail[]>|undefined;
async function records() {
  return pending??=(async()=>{
    const echoes=await loadKneeDemo(()=>{}),saved=await bodyRecordingStore.list();
    return echoes.map(e=>{const record=saved.find(r=>r.motion.id===e.id)!;return {...bodySessionMetadata(record.motion,record.metadata,patientId,true),status:'complete' as const,metrics:analyzeBodySession(record.motion),repetitions:e.repetitions,report:null,motion:record.motion};});
  })().catch(e=>{pending=undefined;throw e;});
}
/** Explicit, local team-video demo. Never combines local footage with authorized patient data. */
export const bodyDemoRepository:SessionRepository={
  async patients(){return [{id:patientId,displayName:'Team knee demo',demonstration:true,schedule:null,totalSessions:2,lastPracticeAt:null,latestSpread:null,adherence:{attended:0,scheduled:0,percent:null}}];},
  async sessions(){return records();},
  async detail(id){const record=(await records()).find(r=>r.id===id);if(!record)throw Error('Demo recording unavailable.');return record;},
  async progress(){return (await records()).map(r=>({id:r.id,startedAt:r.startedAt,hand:r.hand,exerciseId:r.exerciseId,targetKey:'knee-demo-body-v1-side',trackingMode:r.trackingMode,cameraView:r.cameraView,analysisVersion:r.analysisVersion,angle:r.metrics?.body?.primaryValue??null,trackingQuality:r.metrics?.trackingQuality??0,durationMs:r.video.durationMs}));},
  async video(id){await records();const record=(await bodyRecordingStore.list()).find(r=>r.motion.id===id);if(!record)throw Error('Demo video unavailable.');return record.video;},
  async report(){throw Error('AI reports require a shared patient recording. This demo is local.');},
  async upload(){throw Error('The local demo is read-only.');},
};
