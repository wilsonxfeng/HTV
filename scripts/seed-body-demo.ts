import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadConfig } from '../server/config';
import { postgresDatabase } from '../server/db';
import { issueToken } from '../server/auth';
import { ApiSessionRepository } from '../src/features/clinical-data/api';
import { bodySessionMetadata } from '../src/features/clinical-data/echoAdapter';
import type { BodyRecording } from '../src/features/body-tracking/bodyRecordingStore';

// Explicit command only: uploads the two supplied team videos to the configured private backend.
const config=await loadConfig();
if(!config.databaseUrl||!config.s3||config.demo)throw Error('Configure TigerData and S3 before seeding the team-video demo.');
const patientId='e68fce26-7bf8-4a3f-8e59-572c54a23293';
const db=postgresDatabase(config.databaseUrl,config.databaseTlsMode);
try {await db.query(`INSERT INTO patients(id,display_name,demonstration) VALUES($1,'Team knee recordings · Demo',true) ON CONFLICT(id) DO NOTHING`,[patientId]);}finally{await db.close();}
const patientToken=await issueToken(config.secret,{sub:'body-demo-patient',role:'patient',patientIds:[patientId]}),clinicianToken=await issueToken(config.secret,{sub:'body-demo-clinician',role:'clinician',patientIds:[patientId]});
const repository=new ApiSessionRepository(config.publicUrl,()=>patientToken);
const prepared=JSON.parse(await readFile(new URL('../public/demo recordings/body-prepared/manifest.json',import.meta.url),'utf8')) as {recordings:BodyRecording[]};
const files=['leg curl low ROM.mov','leg curl high ROM.mov'];
for(const [index,recording] of prepared.recordings.entries()){
  const video=new Blob([await readFile(new URL(`../public/demo recordings/${files[index]}`,import.meta.url))],{type:'video/mp4'});
  const result=await repository.upload(bodySessionMetadata(recording.motion,recording.metadata,patientId,true),recording.motion,video);
  const detail=await repository.detail(result.id),returned=await repository.video(result.id);
  if(detail.motion.frames.length!==recording.motion.frames.length||returned.size!==video.size||!detail.metrics?.body)throw Error('Stored body recording verification failed.');
  console.log(`Verified knee recording ${index+1}: ${detail.motion.frames.length} pose frames, ${detail.repetitions.length} repetition, ${detail.metrics.body.primaryValue?.toFixed(1)}°.`);
}
await mkdir(new URL('../.evidence/',import.meta.url),{recursive:true});
await writeFile(new URL('../.evidence/body-demo-access.json',import.meta.url),JSON.stringify({patientId,patientToken,clinicianToken,sessionIds:prepared.recordings.map(r=>r.motion.id)},null,2),{mode:0o600});
console.log('Private demo access saved to .evidence/body-demo-access.json.');
