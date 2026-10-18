// @vitest-environment jsdom
import { cleanup, render, screen, act, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MovementEchoes from './MovementEchoes';
import { GREATEST_FINGER_QUESTION, GREATEST_FINGER_REPLY } from '../ask-remotion/localSearch';
import type { EchoSession } from './types';
const mock=vi.hoisted(()=>({viewer:vi.fn(),list:vi.fn().mockResolvedValue([]),cache:vi.fn(),saveCache:vi.fn()}));
vi.mock('./repository',()=>({echoRepository:mock}));
vi.mock('./EchoViewer',()=>({default:(props:unknown)=>{mock.viewer(props);return null;}}));
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
  it('keeps existing overlay selection while evidence focuses an added authorized session',async()=>{
    const first=clip('authorized-a'),second=clip('authorized-b'),third=clip('authorized-c');
    const props={providedOnly:true,sessions:[first,second]};
    const view=render(<MovementEchoes {...props}/>);
    await act(async()=>{});
    const overlay=screen.getByRole('checkbox',{name:'Show past sessions'}) as HTMLInputElement;
    fireEvent.click(overlay);expect(overlay.checked).toBe(true);
    await act(async()=>{view.rerender(<MovementEchoes {...props} sessions={[first,second,third]} evidenceFocus={{sessionId:third.id,repetitionIndex:null,timestampMs:null,token:1}}/>);});
    expect((screen.getByRole('checkbox',{name:'Show past sessions'}) as HTMLInputElement).checked).toBe(true);
    const chips=[...document.querySelectorAll('.echo-session-chips button')];expect(chips).toHaveLength(3);
    expect(chips.find(c=>c.textContent?.includes('authorized-c'))?.getAttribute('aria-pressed')).toBe('true');
  });

});

it('runs the local scripted question inside Echoes and focuses the greatest valid recording at its real peak', async()=>{
 const a=clip('ordinary'),b=clip('winner');
 for(const [recording,value] of [[a,12],[b,28]] as const){
  recording.frames=Array.from({length:181},(_,i)=>({tMs:i*100,valid:true,spread:value,image:[],world:[]}));
  recording.repetitions=[{startMs:1000,peakMs:4000,endMs:7000,valid:true,coverage:1,peakSpread:value}];
 }
 const view=render(<MovementEchoes providedOnly sessions={[a,b]} initialFocusedSessionId={a.id}/>);
 await act(async()=>{});
 fireEvent.click(screen.getByText(GREATEST_FINGER_QUESTION));
 await screen.findByText(GREATEST_FINGER_REPLY);
 const props=mock.viewer.mock.lastCall?.[0];
 expect(props).toMatchObject({focusId:b.id,evidenceFocus:{sessionId:b.id,timestampMs:4000,repetitionIndex:0}});
 expect(document.querySelector('.echo-session-chips button.selected')?.textContent).toContain('winner');
 expect(view.container.textContent).not.toMatch(/°|%|Recorded movement|tracked samples|reliable outline samples/);
 // A second ask after manually selecting another clip focuses and pauses the result again.
 fireEvent.click([...document.querySelectorAll('.echo-session-chips button')].find(button=>button.textContent?.includes('ordinary'))!);
 fireEvent.click(screen.getByText(GREATEST_FINGER_QUESTION));
 await act(async()=>{});
 expect(mock.viewer.mock.lastCall?.[0].evidenceFocus.token).toBeGreaterThan(props.evidenceFocus.token);
 expect(mock.viewer.mock.lastCall?.[0].focusId).toBe(b.id);
});
