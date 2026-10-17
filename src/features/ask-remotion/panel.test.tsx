// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AskRemotionPanel from './AskRemotionPanel';
import type { SearchResult } from './contracts';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../clinical-data/access',()=>({clinicalRepository:{request}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const evidence={side:'Right' as const,sessionId:'exact-id',repetitionIndex:2,timestampMs:4321,recordedAt:'2026-10-17T10:00:00Z',exerciseId:'finger-spread-close',metricKey:'finger_opening' as const,metricValue:21,metricUnit:'°',qualityStatus:'99% tracked',playable:true};
const answer:SearchResult={status:'ok',source:'preset',message:'Greatest value',metricLabel:'Mean separation',evidence:[evidence],action:{type:'focus_session',sessionIds:['exact-id'],pause:true}};
it('opens returned evidence and offers exact recording details',async()=>{
 request.mockResolvedValue(answer);const open=vi.fn().mockResolvedValue(undefined);render(<AskRemotionPanel patientId="patient" exerciseId="finger-spread-close" side="Right" onOpen={open}/>);
 fireEvent.click(screen.getByText('Greatest finger opening'));await waitFor(()=>expect(open).toHaveBeenCalled());expect(open.mock.calls[0][0]).toEqual([evidence]);expect(screen.getByText(/Repetition 3/)).toBeTruthy();expect(JSON.parse(request.mock.calls[0][1].body).patientId).toBe('patient');
});
it('discards a stale response even if a provider ignores cancellation',async()=>{
 let resolve!:(v:SearchResult)=>void;request.mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValueOnce({...answer,status:'empty',message:'No measurements',evidence:[],action:null});const open=vi.fn();render(<AskRemotionPanel patientId="patient" exerciseId="finger-spread-close" side="Right" onOpen={open}/>);
 fireEvent.click(screen.getByText('Greatest finger opening'));fireEvent.click(screen.getByText('Smallest knee-extension range'));await screen.findByText('No measurements');await act(async()=>resolve(answer));expect(open).not.toHaveBeenCalled();expect(screen.queryByText('Greatest value')).toBeNull();
});
it('shows Gemini failure and still permits a preset search',async()=>{
 request.mockRejectedValueOnce(new Error('Try a suggested search.')).mockResolvedValueOnce({...answer,evidence:[],status:'empty'});render(<AskRemotionPanel patientId="p" exerciseId="finger-spread-close" side="Right" onOpen={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Ask about recorded movements'),{target:{value:'Find greatest opening'}});fireEvent.click(screen.getByText('Search'));await screen.findByRole('alert');fireEvent.click(screen.getByText('Greatest finger opening'));await screen.findByText('Greatest value');expect(request).toHaveBeenCalledTimes(2);
});
