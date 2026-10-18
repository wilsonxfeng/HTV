// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AskRemotionPanel from './AskRemotionPanel';
import { GREATEST_FINGER_QUESTION, GREATEST_FINGER_REPLY } from './localSearch';
import type { SearchResult } from './contracts';
const request = vi.hoisted(() => vi.fn());
vi.mock('../clinical-data/access', () => ({ clinicalRepository: { request } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const evidence = { side: 'Right' as const, sessionId: 'exact-id', repetitionIndex: 2, timestampMs: 4321, recordedAt: '2026-10-17T10:00:00Z', exerciseId: 'finger-spread-close', metricKey: 'finger_opening' as const, metricValue: 21, metricUnit: '°', qualityStatus: '99% tracked', playable: true };
const answer: SearchResult = { status: 'ok', source: 'preset', message: 'Greatest value: 21°', metricLabel: 'Mean separation', evidence: [evidence], action: { type: 'focus_session', sessionIds: ['exact-id'], pause: true } };
it('uses the scripted response and a deterministic query for the exact typed question, then focuses the real evidence', async () => {
  request.mockResolvedValue(answer); const open = vi.fn().mockResolvedValue(undefined);
  const view = render(<AskRemotionPanel patientId="patient" exerciseId="finger-spread-close" side="Right" onOpen={open}/>);
  fireEvent.change(screen.getByLabelText('Ask about recorded movements'), { target: { value: `*${GREATEST_FINGER_QUESTION}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  await screen.findByText(GREATEST_FINGER_REPLY);
  expect(open.mock.calls[0][0]).toEqual([evidence]);
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ patientId: 'patient', preset: 'greatest-finger' });
  expect(view.container.textContent).not.toMatch(/21|99%|degrees|°|Gemini|Repetition/);
});
it('discards a stale response even when a provider ignores cancellation', async () => {
  let resolve!: (value: SearchResult) => void;
  request.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce({ ...answer, status: 'empty', evidence: [], action: null });
  const open = vi.fn(); render(<AskRemotionPanel patientId="patient" exerciseId="finger-spread-close" side="Right" onOpen={open}/>);
  fireEvent.click(screen.getByText('Compare first and latest')); fireEvent.click(screen.getByText(GREATEST_FINGER_QUESTION));
  await screen.findByText('I couldn’t find a matching movement in these recordings.');
  await act(async () => resolve(answer)); expect(open).not.toHaveBeenCalled(); expect(screen.queryByText(GREATEST_FINGER_REPLY)).toBeNull();
});
it('automatically opens comparison evidence and keeps the answer while focus moves to another exercise', async () => {
  request.mockResolvedValue({ ...answer, evidence: [evidence, { ...evidence, sessionId: 'latest' }] }); const open = vi.fn().mockResolvedValue(undefined);
  const view = render(<AskRemotionPanel patientId="patient" exerciseId="finger-spread-close" side="Right" onOpen={open}/>);
  fireEvent.click(screen.getByText('Compare first and latest'));
  await screen.findByText('Here are the first and latest comparable sessions. I’ve brought them together for you.');
  expect(open.mock.calls[0][0]).toHaveLength(2);
  view.rerender(<AskRemotionPanel patientId="patient" exerciseId="seated-knee-extension" side="Right" onOpen={open}/>);
  expect(screen.getByText('Here are the first and latest comparable sessions. I’ve brought them together for you.')).toBeTruthy();
});
it('does not claim to have focused a recording when playback loading fails', async () => {
  request.mockResolvedValue(answer);
  render(<AskRemotionPanel patientId="patient" exerciseId="finger-spread-close" side="Right" onOpen={vi.fn().mockRejectedValue(Error('Video unavailable.'))}/>);
  fireEvent.click(screen.getByText(GREATEST_FINGER_QUESTION));
  await screen.findByRole('alert'); expect(screen.queryByText(GREATEST_FINGER_REPLY)).toBeNull();
});
it('cancels account-scoped requests when the account changes', async () => {
  request.mockImplementation(() => new Promise(() => {}));
  const view = render(<AskRemotionPanel patientId="first" exerciseId="finger-spread-close" side="Right" onOpen={vi.fn()}/>);
  fireEvent.click(screen.getByText(GREATEST_FINGER_QUESTION)); const signal = request.mock.calls[0][1].signal;
  view.rerender(<AskRemotionPanel patientId="other" exerciseId="finger-spread-close" side="Right" onOpen={vi.fn()}/>);
  expect(signal.aborted).toBe(true);
});
