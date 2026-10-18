// @vitest-environment jsdom
import { cleanup, render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MovementEchoes from './MovementEchoes';
import { GREATEST_FINGER_QUESTION } from '../ask-remotion/localSearch';
import type { EchoSession } from './types';
const mock=vi.hoisted(()=>({viewer:vi.fn(),list:vi.fn().mockResolvedValue([]),cache:vi.fn(),saveCache:vi.fn(),request:vi.fn()}));
vi.mock('../clinical-data/access',()=>({clinicalRepository:{request:mock.request}}));
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
    expect(document.querySelectorAll('#echo-recording-choice option')).toHaveLength(2);
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
    fireEvent.click(screen.getByText('Your echoes'));
    const overlay=screen.getByRole('checkbox',{name:'Show past sessions'}) as HTMLInputElement;
    fireEvent.click(overlay);expect(overlay.checked).toBe(true);
    await act(async()=>{view.rerender(<MovementEchoes {...props} sessions={[first,second,third]} evidenceFocus={{sessionId:third.id,repetitionIndex:null,timestampMs:null,token:1}}/>);});
    expect((screen.getByRole('checkbox',{name:'Show past sessions'}) as HTMLInputElement).checked).toBe(true);
    const chips=[...document.querySelectorAll('#echo-recording-choice option')];expect(chips).toHaveLength(3);
    expect((screen.getByLabelText('Choose a recording') as HTMLSelectElement).value).toBe('authorized-c');
  });

});

it('submits chat with Enter and focuses the returned recording without expanding secondary panels', async()=>{
 const a=clip('ordinary'),b=clip('winner');
 for(const [recording,value] of [[a,12],[b,28]] as const){
  recording.frames=Array.from({length:181},(_,i)=>({tMs:i*100,valid:true,spread:value,image:[],world:[]}));
  recording.repetitions=[{startMs:1000,peakMs:4000,endMs:7000,valid:true,coverage:1,peakSpread:value}];
 }
 mock.request.mockResolvedValue({message:'Found the greatest opening.',evidence:[{sessionId:b.id,repetitionIndex:0,timestampMs:4000,playable:true}]});
 const view=render(<MovementEchoes providedOnly sessions={[a,b]} initialFocusedSessionId={a.id}/>);
 await act(async()=>{});
 fireEvent.change(screen.getByLabelText('Ask about recorded movements'),{target:{value:GREATEST_FINGER_QUESTION}});
 fireEvent.keyDown(screen.getByLabelText('Ask about recorded movements'),{key:'Enter'});
 await screen.findByText('Found the greatest opening.');
 await waitFor(() => expect(mock.viewer.mock.lastCall?.[0].focusId).toBe(b.id));
 const props=mock.viewer.mock.lastCall?.[0];
 expect(props).toMatchObject({focusId:b.id,evidenceFocus:{sessionId:b.id,timestampMs:4000,repetitionIndex:0}});
 expect((screen.getByLabelText('Choose a recording') as HTMLSelectElement).value).toBe('winner');
 expect(view.container.querySelector('.ask-remotion')?.textContent).not.toMatch(/°|%|Recorded movement|tracked samples|reliable outline samples/);
 expect(screen.getByRole('combobox', {name:'Choose a recording'})).toBeTruthy();
 expect(view.container.querySelector('.echo-control-card')?.hasAttribute('open')).toBe(false);
 // A second ask after manually selecting another clip focuses and pauses the result again.
 fireEvent.change(screen.getByLabelText('Choose a recording'),{target:{value:'ordinary'}});
 fireEvent.change(screen.getByLabelText('Ask about recorded movements'),{target:{value:GREATEST_FINGER_QUESTION}});
 fireEvent.keyDown(screen.getByLabelText('Ask about recorded movements'),{key:'Enter'});
 await act(async()=>{});
 expect(mock.viewer.mock.lastCall?.[0].evidenceFocus.token).toBeGreaterThan(props.evidenceFocus.token);
 expect(mock.viewer.mock.lastCall?.[0].focusId).toBe(b.id);
});

it('selects a shared repetition and allows an overlay to follow a different rep', async () => {
  const a = clip('leg-a'), b = clip('leg-b');
  for (const session of [a, b]) {
    session.exerciseId = 'seated-knee-extension'; session.trackingMode = 'pose';
    session.repetitions = [
      { startMs: 1000, peakMs: 2000, endMs: 3000, peakSpread: 140, valid: true, coverage: 1 },
      { startMs: 7000, peakMs: 8000, endMs: 9000, peakSpread: 145, valid: true, coverage: 1 },
    ];
  }
  render(<MovementEchoes providedOnly sessions={[a, b]} initialFocusedSessionId={a.id}/>);
  const common = await screen.findByLabelText('Comparison repetition');
  fireEvent.change(common, { target: { value: '1' } });
  await waitFor(() => expect(mock.viewer.mock.lastCall?.[0].repChoices).toMatchObject({ 'leg-a': 1, 'leg-b': 1 }));
  fireEvent.change(screen.getByLabelText('leg-b repetition'), { target: { value: '0' } });
  await waitFor(() => expect(mock.viewer.mock.lastCall?.[0].repChoices).toMatchObject({ 'leg-a': 1, 'leg-b': 0 }));
});
