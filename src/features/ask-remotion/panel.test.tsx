// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AskRemotionPanel from './AskRemotionPanel';
import { GREATEST_FINGER_QUESTION } from './localSearch';
import type { SearchResult } from './contracts';
const request = vi.hoisted(() => vi.fn());
vi.mock('../clinical-data/access', () => ({ clinicalRepository: { request } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const evidence = { side: 'Right' as const, sessionId: 'exact-id', repetitionIndex: 2, timestampMs: 4321, recordedAt: '2026-10-17T10:00:00Z', exerciseId: 'finger-spread-close', metricKey: 'finger_opening' as const, metricValue: 21, metricUnit: '°', qualityStatus: '99% tracked', playable: true };
function ask(question: string) {
  const input = screen.getByLabelText('Ask about recorded movements');
  fireEvent.change(input, { target: { value: question } });
  fireEvent.keyDown(input, { key: 'Enter' });
}
const answer: SearchResult = { status: 'ok', source: 'preset', message: 'Greatest value: 21°', metricLabel: 'Mean separation', evidence: [evidence], action: { type: 'focus_session', sessionIds: ['exact-id'], pause: true } };
it('sends typed questions to Gemini chat, opens exact evidence, and carries follow-up history', async () => {
  request.mockResolvedValue({ message: 'The October 17 recording has the greatest opening.', evidence: [evidence] });
  const open = vi.fn().mockResolvedValue(undefined);
  render(<AskRemotionPanel patientId="patient" exerciseId="finger-spread-close" side="Right" focusId="current" onOpen={open}/>);
  expect(screen.queryByRole('button')).toBeNull();
  fireEvent.change(screen.getByLabelText('Ask about recorded movements'), { target: { value: GREATEST_FINGER_QUESTION } });
  fireEvent.keyDown(screen.getByLabelText('Ask about recorded movements'), { key: 'Enter' });
  await screen.findByText('The October 17 recording has the greatest opening.');
  expect(open.mock.calls[0][0]).toEqual([evidence]);
  expect(request.mock.calls[0][0]).toBe('/api/ask-remotion/chat');
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ question: GREATEST_FINGER_QUESTION, history: [], focusId: 'current', recordings: [] });
  request.mockResolvedValue({ message: 'Here is the earlier recording.', evidence: [] });
  fireEvent.change(screen.getByLabelText('Ask about recorded movements'), { target: { value: 'What about the earlier one?' } });
  fireEvent.keyDown(screen.getByLabelText('Ask about recorded movements'), { key: 'Enter' });
  await screen.findByText('Here is the earlier recording.');
  expect(JSON.parse(request.mock.calls[1][1].body).history).toEqual([
    { role: 'user', content: GREATEST_FINGER_QUESTION },
    { role: 'assistant', content: 'The October 17 recording has the greatest opening.' },
  ]);
});
it('prevents duplicate submissions while waiting and ignores a stale reply after account change', async () => {
  let resolve!: (value: SearchResult) => void;
  request.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const open = vi.fn();
  const view = render(<AskRemotionPanel patientId="patient" exerciseId="finger-spread-close" side="Right" onOpen={open}/>);
  ask('Find the latest recording');
  ask('Find the earliest recording');
  expect(request).toHaveBeenCalledTimes(1);
  view.rerender(<AskRemotionPanel patientId="other" exerciseId="finger-spread-close" side="Right" onOpen={open}/>);
  await act(async () => resolve(answer));
  expect(open).not.toHaveBeenCalled();
  expect(screen.queryByText(answer.message)).toBeNull();
});
it('automatically opens comparison evidence and keeps the answer while focus moves to another exercise', async () => {
  request.mockResolvedValue({ ...answer, message: 'Here are the first and latest comparable sessions.', evidence: [evidence, { ...evidence, sessionId: 'latest' }] }); const open = vi.fn().mockResolvedValue(undefined);
  const view = render(<AskRemotionPanel patientId="patient" exerciseId="finger-spread-close" side="Right" onOpen={open}/>);
  ask('Compare first and latest');
  await screen.findByText('Here are the first and latest comparable sessions.');
  expect(open.mock.calls[0][0]).toHaveLength(2);
  view.rerender(<AskRemotionPanel patientId="patient" exerciseId="seated-knee-extension" side="Right" onOpen={open}/>);
  expect(screen.getByText('Here are the first and latest comparable sessions.')).toBeTruthy();
});
it('does not claim to have focused a recording when playback loading fails', async () => {
  request.mockResolvedValue(answer);
  render(<AskRemotionPanel patientId="patient" exerciseId="finger-spread-close" side="Right" onOpen={vi.fn().mockRejectedValue(Error('Video unavailable.'))}/>);
  ask(GREATEST_FINGER_QUESTION);
  await screen.findByRole('alert'); expect(screen.queryByText(answer.message)).toBeNull();
});
it('cancels account-scoped requests when the account changes', async () => {
  request.mockImplementation(() => new Promise(() => {}));
  const view = render(<AskRemotionPanel patientId="first" exerciseId="finger-spread-close" side="Right" onOpen={vi.fn()}/>);
  ask(GREATEST_FINGER_QUESTION); const signal = request.mock.calls[0][1].signal;
  view.rerender(<AskRemotionPanel patientId="other" exerciseId="finger-spread-close" side="Right" onOpen={vi.fn()}/>);
  expect(signal.aborted).toBe(true);
});
