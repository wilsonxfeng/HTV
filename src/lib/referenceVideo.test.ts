import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDemoHand } from './demo';
import { pairAngles } from './geometry';
import { extractReferenceFromVideo } from './referenceVideo';
const engine=vi.hoisted(()=>({detect:vi.fn(),close:vi.fn(),create:vi.fn()}));
vi.mock('@mediapipe/tasks-vision',()=>({FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:engine.create}}));
let duration=2;
class TestVideo extends EventTarget {
 readyState=0;duration=duration;muted=false;playsInline=false;preload='';private time=0;
 set src(_:string){queueMicrotask(()=>{this.readyState=2;this.dispatchEvent(new Event('loadedmetadata'));});}
 set currentTime(value:number){this.time=value;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}
 get currentTime(){return this.time;}
 removeAttribute(){} load(){}
}
beforeEach(()=>{duration=2;engine.detect.mockReset();engine.close.mockReset();engine.create.mockReset();engine.create.mockResolvedValue({detectForVideo:engine.detect,close:engine.close});vi.stubGlobal('document',{createElement:()=>new TestVideo()});vi.stubGlobal('window',globalThis);vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test-reference');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('local reference-video integration',()=>{
 it('rejects non-video input without creating a detector',async()=>{await expect(extractReferenceFromVideo(new File(['x'],'notes.txt',{type:'text/plain'}))).rejects.toThrow('Choose a video');expect(engine.create).not.toHaveBeenCalled();});
 it('extracts neutral and spread poses while retaining source provenance',async()=>{let frame=0;engine.detect.mockImplementation(()=>({worldLandmarks:[makeDemoHand(frame++<12?0:1,'Right')]}));const progress=vi.fn();const result=await extractReferenceFromVideo(new File(['x'],'example.mp4',{type:'video/mp4'}),progress);expect(result.frames).toBe(24);expect(result.duration).toBe(2);expect(result.neutral).toHaveLength(21);expect(pairAngles(result.target)[1]).toBeGreaterThan(pairAngles(result.neutral)[1]+2);expect(progress).toHaveBeenLastCalledWith(1);expect(engine.close).toHaveBeenCalledOnce();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-reference');});
 it('rejects clips without clear tracked hands and cleans up the detector',async()=>{engine.detect.mockReturnValue({worldLandmarks:[]});await expect(extractReferenceFromVideo(new File(['x'],'empty.mp4',{type:'video/mp4'}))).rejects.toThrow('enough clearly tracked');expect(engine.close).toHaveBeenCalledOnce();expect(URL.revokeObjectURL).toHaveBeenCalled();});
 it('cancels import when the exercise screen unmounts',async()=>{const abort=new AbortController();engine.detect.mockReturnValue({worldLandmarks:[makeDemoHand(1,'Right')]});await expect(extractReferenceFromVideo(new File(['x'],'example.mp4',{type:'video/mp4'}),()=>abort.abort(),abort.signal)).rejects.toMatchObject({name:'AbortError'});expect(engine.detect).toHaveBeenCalledOnce();expect(engine.close).toHaveBeenCalledOnce();});
 it('rejects clips shorter than one second and revokes their object URL',async()=>{duration=.5;await expect(extractReferenceFromVideo(new File(['x'],'short.mp4',{type:'video/mp4'}))).rejects.toThrow('between 1 and 90');expect(engine.create).not.toHaveBeenCalled();expect(URL.revokeObjectURL).toHaveBeenCalled();});
});
