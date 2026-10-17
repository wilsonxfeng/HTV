// @vitest-environment jsdom
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MovementEchoes from './MovementEchoes';
import type { EchoSession } from './types';
const mock=vi.hoisted(()=>({list:vi.fn().mockResolvedValue([]),cache:vi.fn(),saveCache:vi.fn()}));
vi.mock('./repository',()=>({echoRepository:mock}));
vi.mock('./EchoViewer',()=>({default:()=>null}));
vi.mock('./SideBySide',()=>({default:()=>null}));
vi.mock('./processing',()=>({buildGhostCache:vi.fn(),importRecording:vi.fn()}));
function clip(id:string):EchoSession{return {id,name:id,createdAt:new Date().toISOString(),exerciseId:'finger-spread-close',selectedHand:'Right',mirrored:false,demonstration:false,video:new Blob(['video']),videoWidth:640,videoHeight:480,videoDurationMs:18000,landmarkOffsetMs:0,frames:[],repetitions:[],sourceFingerprint:id};}
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('authorized remote comparison scope',()=>{
  it('uses only provided sessions and excludes local import, editing and deletion',async()=>{
    await act(async()=>{render(<MovementEchoes providedOnly sessions={[clip('authorized-a'),clip('authorized-b')]}/>);});
    expect(mock.list).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.echo-session-chips button')).toHaveLength(2);
    expect(screen.queryByText('Add a recording')).toBeNull();
    expect(screen.queryByText('Delete this local recording')).toBeNull();
    expect(screen.queryByText('Original video and manual phase markers')).toBeNull();
    expect(mock.saveCache).not.toHaveBeenCalled();
  });
});
