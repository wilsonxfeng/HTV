import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { localDatabase, migrate } from '../../db';
import { ClinicalRepository } from '../../repository';
import { LocalVideoStore } from '../../videos';
import { buildApi } from '../../app';
import { issueToken } from '../../auth';
import type { Config } from '../../config';
import { executeSearch } from './queryExecutor';
import { intentSchema, presetIntent, GeminiIntentParser } from './intentParser';
const sdk = vi.hoisted(()=>({generate:vi.fn()}));
vi.mock('@google/genai',()=>({GoogleGenAI:class {models={generateContent:sdk.generate}},ThinkingLevel:{LOW:'LOW'}}));
const db=localDatabase(),patient=randomUUID(),other=randomUUID(),secret='ask-remotion-test-secret-long-enough-12345';
const first=randomUUID(),latest=randomUUID(),bad=randomUUID(),knee=randomUUID(),otherSession=randomUUID();
let app:Awaited<ReturnType<typeof buildApi>>,token:string;
async function insert(id:string,owner:string,exercise:string,date:string,value:number,quality=99,withVideo=true){
 const metadata={id,patientId:owner,exerciseId:exercise,hand:'Right',videoKind:'synthetic',video:{durationMs:10000}};
 await db.query(`INSERT INTO sessions(id,patient_id,exercise_id,hand,started_at,status,video_mime_type,duration_ms,metadata,calibration,video_key) VALUES($1,$2,$3,'Right',$4,'complete','video/webm',10000,$5::jsonb,$6::jsonb,$7)`,[id,owner,exercise,date,JSON.stringify(metadata),JSON.stringify({calibration:{neutral:[],target:[],source:'demo',createdAt:date},duration:date.endsWith('01Z')?10:20}),withVideo?'test-video':null]);
 await db.query('INSERT INTO session_reports(session_id,metrics) VALUES($1,$2::jsonb)',[id,JSON.stringify({trackingQuality:quality,body:{movementRange:value,maximumAngle:value+80}})]);
 await db.query('INSERT INTO repetitions(session_id,rep_index,start_ms,peak_ms,end_ms,metrics) VALUES($1,0,1000,2500,4000,$2::jsonb)',[id,JSON.stringify({valid:true,coverage:1,peakSpread:value,startMs:1000,peakMs:2500,endMs:4000})]);
}
beforeAll(async()=>{
 await migrate(db,false);await db.query('INSERT INTO patients(id,display_name) VALUES($1,\'Fictional A\'),($2,\'Fictional B\')',[patient,other]);
 await insert(first,patient,'finger-spread-close','2026-10-01T10:00:01Z',12);
 await insert(latest,patient,'finger-spread-close','2026-10-03T10:00:00Z',24);
 await insert(bad,patient,'finger-spread-close','2026-10-04T10:00:00Z',90,30);
 await insert(knee,patient,'seated-knee-extension','2026-10-02T10:00:00Z',17,99,false);
 await insert(otherSession,other,'finger-spread-close','2026-10-05T10:00:00Z',100);
 app=await buildApi({secret,origin:'http://localhost:5173'} as Config,new ClinicalRepository(db,new LocalVideoStore('/private/tmp/ask-remotion-test-unused',secret,'http://localhost:3001')));
 token=await issueToken(secret,{sub:'reviewer',role:'clinician',patientIds:[patient]});
},30000);
afterAll(async()=>{await app.close();await db.close();});
describe('deterministic stored evidence',()=>{
 it('finds actual max with exact session, repetition and video-clock timestamp; excludes other patients and poor tracking',async()=>{
 const r=await executeSearch(db,patient,presetIntent('greatest-finger','Right'),'preset');expect(r.evidence[0]).toMatchObject({sessionId:latest,repetitionIndex:0,timestampMs:2500,metricValue:24});
 });
 it('changes the answer when persisted measurements change',async()=>{
 await db.query(`UPDATE repetitions SET metrics=jsonb_set(metrics,'{peakSpread}','30') WHERE session_id=$1`,[first]);
 expect((await executeSearch(db,patient,presetIntent('greatest-finger','Right'),'preset')).evidence[0].sessionId).toBe(first);
 await db.query(`UPDATE repetitions SET metrics=jsonb_set(metrics,'{peakSpread}','12') WHERE session_id=$1`,[first]);
 });
 it('compares first/latest using compatible session peaks even with different durations',async()=>{
 const r=await executeSearch(db,patient,presetIntent('first-latest-finger','Right'),'preset');expect(r.evidence.map(e=>e.sessionId)).toEqual([first,latest]);expect(r.message).toContain('12.0°');
 });
 it('queries knee range independently without inventing a timestamp or video',async()=>{
 const r=await executeSearch(db,patient,presetIntent('smallest-knee','Right'),'preset');expect(r.evidence[0]).toMatchObject({sessionId:knee,metricValue:17,timestampMs:null,repetitionIndex:null,playable:false});
 });
 it('uses explicit finger-pair aggregates with no invented repetition timestamp',async()=>{
 await db.query(`UPDATE session_reports SET metrics=jsonb_set(metrics,'{pairs}',$2::jsonb) WHERE session_id=$1`,[first,JSON.stringify([{pair:'Index–Middle',achieved:18}])]);
 const r=await executeSearch(db,patient,{...presetIntent('greatest-finger','Right'),metricKey:'finger_index_middle'},'gemini');
 expect(r.evidence[0]).toMatchObject({sessionId:first,metricValue:18,timestampMs:null,repetitionIndex:null});
 });
 it('excludes static poses and low repetition coverage from finger extrema',async()=>{
 await db.query(`UPDATE repetitions SET metrics=jsonb_set(metrics,'{static}','true') WHERE session_id=$1`,[latest]);
 expect((await executeSearch(db,patient,presetIntent('greatest-finger','Right'),'preset')).evidence[0].sessionId).toBe(first);
 await db.query(`UPDATE repetitions SET metrics=jsonb_set(metrics,'{static}','false') WHERE session_id=$1`,[latest]);
 await db.query(`UPDATE repetitions SET metrics=jsonb_set(metrics,'{coverage}','0.2') WHERE session_id=$1`,[latest]);
 expect((await executeSearch(db,patient,presetIntent('greatest-finger','Right'),'preset')).evidence[0].sessionId).toBe(first);
 await db.query(`UPDATE repetitions SET metrics=jsonb_set(metrics,'{coverage}','1') WHERE session_id=$1`,[latest]);
 });
 it('returns no data rather than substituting the other side',async()=>{expect((await executeSearch(db,patient,presetIntent('smallest-knee','Left'),'preset')).status).toBe('empty');});
 it('does not mix analysis versions',async()=>{
 await db.query("UPDATE sessions SET analysis_version='new' WHERE id=$1",[latest]);
 expect((await executeSearch(db,patient,presetIntent('first-latest-finger','Right'),'preset')).status).toBe('empty');
 await db.query('UPDATE sessions SET analysis_version=null WHERE id=$1',[latest]);
 });
});
describe('authorized API and provider fallback',()=>{
 const payload={patientId:patient,question:'greatest opening',preset:'greatest-finger',exerciseContext:{exerciseId:'finger-spread-close',side:'Right'}};
 it('requires authentication and clinician patient access',async()=>{
 expect((await app.inject({method:'POST',url:'/api/ask-remotion',payload})).statusCode).toBe(401);
 expect((await app.inject({method:'POST',url:'/api/ask-remotion',headers:{authorization:`Bearer ${token}`},payload:{...payload,patientId:other}})).statusCode).toBe(403);
 });
 it('offers real presets without Gemini and returns a clear typed-question error',async()=>{
 const headers={authorization:`Bearer ${token}`};
 expect((await app.inject({method:'POST',url:'/api/ask-remotion',headers,payload})).json().source).toBe('preset');
 expect((await app.inject({method:'POST',url:'/api/ask-remotion',headers,payload:{...payload,preset:undefined}})).statusCode).toBe(503);
 });
});
describe('strict Gemini translation',()=>{
 it.each(['greatest-finger','smallest-knee','first-latest-finger'] as const)('validates %s model intent',async preset=>{
 const expected=presetIntent(preset,'Right');sdk.generate.mockResolvedValue({text:JSON.stringify(expected)});
 expect(await new GeminiIntentParser('fake','test').parse('question',{exerciseId:'finger-spread-close',side:'Right'})).toEqual(expected);
 });
 it('rejects unknown metric, SQL fields and incompatible aggregations',()=>{
 const i=presetIntent('greatest-finger','Right');expect(intentSchema.safeParse({...i,sql:'DROP TABLE sessions'}).success).toBe(false);expect(intentSchema.safeParse({...i,metricKey:'strength'}).success).toBe(false);expect(intentSchema.safeParse({...i,aggregation:'first'}).success).toBe(false);
 });
 it('returns a safe failure for provider errors or invalid JSON',async()=>{
 sdk.generate.mockResolvedValue({text:'not json'});await expect(new GeminiIntentParser('fake','test').parse('x',{exerciseId:'x',side:'Right'})).rejects.toThrow('suggested searches');
 });
 it('does not query data for unsupported medical requests',async()=>{const r=await executeSearch(db,patient,{...presetIntent('greatest-finger','Right'),type:'unsupported'},'gemini');expect(r.evidence).toEqual([]);expect(r.status).toBe('unsupported');});
});
