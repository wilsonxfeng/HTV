// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import EchoViewer from './EchoViewer';
import type { EchoSession } from './types';
const decode=vi.hoisted(()=>vi.fn().mockResolvedValue([]));
vi.mock('./rendering',()=>({decodeCache:decode,drawGhost:vi.fn(),ECHO_COLORS:['#ffffff'],hitGhosts:vi.fn(),sampleGhost:vi.fn()}));
beforeAll(()=>{
 vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
 URL.createObjectURL=vi.fn(()=> 'blob:test');URL.revokeObjectURL=vi.fn();
 vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({clearRect:vi.fn()} as never);
});
afterEach(()=>cleanup());
const clip:EchoSession={id:'focus',name:'focus',createdAt:'2026-10-17',exerciseId:'finger-spread-close',selectedHand:'Right',mirrored:false,demonstration:true,video:new Blob(['video']),videoWidth:640,videoHeight:480,videoDurationMs:10000,landmarkOffsetMs:0,frames:[],sourceFingerprint:'test',repetitions:[{startMs:1000,peakMs:3000,endMs:5000,valid:true,coverage:1,peakSpread:20}]};
it('seeks the original video to the exact evidence time, pauses, and retains ghost inputs',async()=>{
 const ghost={...clip,id:'ghost'};const props={sessions:[clip,ghost],focusId:'focus',repChoices:{focus:0,ghost:0},caches:{},ghostIds:['ghost'],opacity:.3,onFocus:vi.fn(),revealToken:0};
 const view=render(<EchoViewer {...props} evidenceFocus={{sessionId:'focus',timestampMs:3210,repetitionIndex:0,token:1}}/>);const video=view.container.querySelector('video')!;
 await act(async()=>{fireEvent.loadedMetadata(video);fireEvent.seeked(video);} );expect(video.currentTime).toBe(3.21);expect(video.pause).toHaveBeenCalled();expect(view.container.querySelector('[aria-label="Play comparison"]')).toBeTruthy();
 // Existing playback remains usable after the search pause.
 const play=view.container.querySelector('[aria-label="Play comparison"]')!;await act(async()=>fireEvent.click(play));expect(video.play).toHaveBeenCalled();
 view.rerender(<EchoViewer {...props} evidenceFocus={{sessionId:'focus',timestampMs:2750,repetitionIndex:0,token:2}}/>);await act(async()=>{fireEvent.loadedMetadata(video);fireEvent.seeked(video);} );expect(video.currentTime).toBe(2.75);expect(props.ghostIds).toEqual(['ghost']);
});
