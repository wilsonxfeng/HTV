import { afterEach, expect, it, vi } from 'vitest';
import { SessionVideoCapture } from '../clinical-data/capture';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('shares a monotonic video/landmark clock across pauses and excludes microphone tracks',async()=>{
  const videoTrack={readyState:'live',kind:'video'},audioTrack={readyState:'live',kind:'audio'};
  class Stream {constructor(public tracks:unknown[]){}getVideoTracks(){return this.tracks.filter(t=>(t as {kind:string}).kind==='video');}}
  class Recorder {
    static isTypeSupported(){return true;}
    state='inactive';mimeType='video/webm';ondataavailable:(e:{data:Blob})=>void=()=>{};onstop:()=>void=()=>{};onerror=()=>{};
    constructor(stream:Stream){expect(stream.tracks).toEqual([videoTrack]);}
    start(){this.state='recording';}pause(){this.state='paused';}resume(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['video-bytes'])});this.onstop();}
  }
  vi.stubGlobal('MediaStream',Stream);vi.stubGlobal('MediaRecorder',Recorder);
  let now=1010;vi.spyOn(performance,'now').mockImplementation(()=>now);
  const preview={srcObject:new Stream([videoTrack,audioTrack]),videoWidth:640,videoHeight:480} as unknown as HTMLVideoElement;
  const capture=new SessionVideoCapture(),control=capture.start(preview,1000);
  now=2010;control.pause();expect(control.elapsed()).toBe(1010);
  now=4010;expect(control.elapsed()).toBe(1010);control.resume();
  now=5010;expect(control.elapsed()).toBe(2010);control.stop();
  now=9000;expect(control.elapsed()).toBe(2010);
  const result=await capture.finish();expect(result.metadata.durationMs).toBe(2000);expect(result.metadata.landmarkOffsetMs).toBe(-10);
  expect(control.elapsed()+result.metadata.landmarkOffsetMs).toBe(result.metadata.durationMs);
  expect(result.metadata.width).toBe(640);
});
