import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { makeDemoHand } from '../src/lib/demo';
import { getPhase, HAND_CONNECTIONS } from '../src/lib/geometry';
import type { HandFrame, MotionSession } from '../src/lib/types';
import type { ClinicalRepository } from './repository';
import { DEMO_PATIENT_ID } from './auth';
import { LocalVideoStore } from './videos';

const glyphs: Record<string, string[]> = {
  S:['11111','10000','10000','11111','00001','00001','11111'], Y:['10001','10001','01010','00100','00100','00100','00100'], N:['10001','11001','11001','10101','10011','10011','10001'], T:['11111','00100','00100','00100','00100','00100','00100'], H:['10001','10001','10001','11111','10001','10001','10001'], E:['11111','10000','10000','11110','10000','10000','11111'], I:['11111','00100','00100','00100','00100','00100','11111'], C:['11111','10000','10000','10000','10000','10000','11111'], D:['11110','10001','10001','10001','10001','10001','11110'], M:['10001','11011','10101','10101','10001','10001','10001'], O:['11111','10001','10001','10001','10001','10001','11111'],
};
function pixels(frame: HandFrame) {
  const width = 640, height = 480, buffer = Buffer.alloc(width*height*3);
  const pixel = (x: number, y: number, color: number[]) => { if (x>=0&&x<width&&y>=0&&y<height) { const i=(Math.floor(y)*width+Math.floor(x))*3; buffer[i]=color[0];buffer[i+1]=color[1];buffer[i+2]=color[2]; } };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixel(x,y,y<48?[37,77,60]:[237,242,230]);
  let cursor=18;
  for(const letter of 'SYNTHETIC DEMO'){ const glyph=glyphs[letter]; if(glyph) for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(glyph[y][x]==='1')for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++)pixel(cursor+x*3+dx,13+y*3+dy,[255,253,245]); cursor+=18; }
  const image=frame.imageLandmarks!.map(p=>({x:p.x*width,y:p.y*height}));
  const skin=[218,169,133];
  const circle=(x:number,y:number,r:number)=>{ for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r)pixel(Math.round(x+dx),Math.round(y+dy),skin); };
  const palm=[0,5,9,13,17].map(i=>image[i]);
  for(let y=Math.floor(Math.min(...palm.map(p=>p.y)));y<=Math.max(...palm.map(p=>p.y));y++){
    const crossings:number[]=[];for(let i=0;i<palm.length;i++){const a=palm[i],b=palm[(i+1)%palm.length];if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y))crossings.push(a.x+(y-a.y)/(b.y-a.y)*(b.x-a.x));}crossings.sort((a,b)=>a-b);for(let i=0;i+1<crossings.length;i+=2)for(let x=Math.floor(crossings[i]);x<=crossings[i+1];x++)pixel(x,y,skin);
  }
  for(const [a,b] of HAND_CONNECTIONS){const p=image[a],q=image[b],distance=Math.ceil(Math.hypot(q.x-p.x,q.y-p.y));for(let j=0;j<=distance;j++)circle(p.x+(q.x-p.x)*j/Math.max(1,distance),p.y+(q.y-p.y)*j/Math.max(1,distance),11);}
  return buffer;
}

/** Fictional dates and authored geometry; NEVER attributed to a real patient or camera. */
export async function seedDemo(repository: ClinicalRepository, directory: string) {
  if (!(repository.videos instanceof LocalVideoStore)) throw Error('Synthetic seed is restricted to local demo storage.');
  const storage = repository.videos;
  await mkdir(directory, { recursive: true });
  for (const [index, amplitude] of [.55,.7,.8].entries()) {
    const id = `00000000-0000-4000-8000-00000000001${index}`;
    const existing = await repository.db.query('SELECT id FROM sessions WHERE id=$1', [id]);
    if (existing.rows.length) continue;
    const date = new Date(); date.setUTCDate(date.getUTCDate() - (2-index)*3); date.setUTCHours(14,0,0,0);
    const startedAt = date.toISOString();
    const frames: HandFrame[] = Array.from({ length: 18*12 }, (_,i)=>{const t=i/12,landmarks=makeDemoHand(getPhase(t,6).amount*amplitude);return {t,landmarks,worldLandmarks:landmarks,imageLandmarks:landmarks.map(p=>({x:.5+p.x*.14,y:.85-p.y*.25,z:p.z*.14})),tracking:true,confidence:1};});
    const file=resolve(directory,`${id}.mp4`);
    const ffmpeg=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','640x480','-framerate','12','-i','pipe:0','-an','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe']});
    const ended=once(ffmpeg,'exit'); let stderr='';ffmpeg.stderr.on('data',chunk=>{stderr+=String(chunk).slice(0,1000);});
    for(const frame of frames)if(!ffmpeg.stdin.write(pixels(frame)))await once(ffmpeg.stdin,'drain');
    ffmpeg.stdin.end();const [code]=await ended;if(code!==0)throw Error(`Synthetic fixture encoding failed: ${stderr}`);
    const bytes=await readFile(file);
    const motion:MotionSession={id,createdAt:startedAt,exerciseId:'finger-spread-close',hand:'Right',duration:18,cycleDuration:6,source:'demo',completed:true,calibration:{neutral:makeDemoHand(0),target:makeDemoHand(1),source:'demo',hand:'Right',createdAt:startedAt},frames};
    const metadata={id,patientId:DEMO_PATIENT_ID,exerciseId:'finger-spread-close',hand:'Right' as const,startedAt,demonstration:true,videoKind:'synthetic' as const,video:{mimeType:'video/mp4',sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),width:640,height:480,durationMs:18000,landmarkOffsetMs:0,mirrored:false}};
    await repository.create(metadata);
    const signed=await repository.uploadUrl(id);
    const ticket=storage.verify(new URL(signed.url).pathname.split('/').at(-1)!,'put');
    await storage.put(ticket,bytes,'video/mp4');
    await repository.complete(id,motion);
  }
}
