import { beforeEach, expect, it, vi } from 'vitest';
import { GeminiRecordingChat } from './chat';
import type { RecordingSummary } from '../../../src/features/ask-remotion/chat';
import { buildApi } from '../../app';
import type { Config } from '../../config';
import type { ClinicalRepository } from '../../repository';
const sdk = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: sdk.generate }; }, ThinkingLevel: { LOW: 'LOW' } }));
const recording: RecordingSummary = { id: 'clip', name: 'Morning', recordedAt: '2026-10-17T10:00:00Z', exerciseId: 'finger-spread-close', side: 'Right', durationMs: 5000, playable: true, trackingQuality: 99, range: 20, demonstration: true, configuration: 'same', repetitions: [{ index: 0, peakMs: 2400, peak: 25, reliable: true }] };
const chat = new GeminiRecordingChat('fake', 'test');
beforeEach(() => { sdk.generate.mockReset(); });
it('grounds navigation in supplied recording IDs and measured peak times', async () => {
  sdk.generate.mockResolvedValue({ text: JSON.stringify({ message: 'Found the morning recording.', selections: [{ sessionId: 'clip', repetitionIndex: 0 }] }) });
  const result = await chat.reply('open morning', [], [recording], '');
  expect(result.evidence[0]).toMatchObject({ sessionId: 'clip', timestampMs: 2400, repetitionIndex: 0, metricValue: 25 });
});
it.each([
  { selections: [{ sessionId: 'invented', repetitionIndex: null }] },
  { selections: [{ sessionId: 'clip', repetitionIndex: 99 }] },
  { selections: [{ sessionId: 'clip', repetitionIndex: null }, { sessionId: 'clip', repetitionIndex: null }] },
])('rejects invented or duplicate selections %j', async ({ selections }) => {
  sdk.generate.mockResolvedValue({ text: JSON.stringify({ message: 'Found it.', selections }) });
  await expect(chat.reply('find it', [], [recording], '')).rejects.toThrow('could not answer');
});
it('allows clarification without opening a recording and includes history in the Gemini request', async () => {
  sdk.generate.mockResolvedValue({ text: JSON.stringify({ message: 'Which date did you mean?', selections: [] }) });
  const history = [{ role: 'user', content: 'Find the morning recording' }];
  expect((await chat.reply('the other one', history, [recording], 'clip')).evidence).toEqual([]);
  expect(JSON.parse(sdk.generate.mock.calls[0][0].contents)).toMatchObject({ history, focusId: 'clip' });
});
it('rejects incompatible comparisons and unreliable repetition references', async () => {
  sdk.generate.mockResolvedValue({ text: JSON.stringify({ message: 'Compare these.', selections: [{ sessionId: 'clip', repetitionIndex: null }, { sessionId: 'other', repetitionIndex: null }] }) });
  await expect(chat.reply('compare', [], [recording, { ...recording, id: 'other', configuration: 'different' }], '')).rejects.toThrow('could not answer');
  sdk.generate.mockResolvedValue({ text: JSON.stringify({ message: 'Peak.', selections: [{ sessionId: 'clip', repetitionIndex: 0 }] }) });
  await expect(chat.reply('peak', [], [{ ...recording, repetitions: [{ ...recording.repetitions[0], reliable: false }] }], '')).rejects.toThrow('could not answer');
});
it('does not expose provider errors', async () => {
  sdk.generate.mockRejectedValue(Error('secret provider diagnostics'));
  await expect(chat.reply('find', [], [recording], '')).rejects.toThrow('ReMotion could not answer just now. Please try again.');
});
it('protects patient history and restricts anonymous chat to explicit local preview', async () => {
  const repository = { sessions: vi.fn() } as unknown as ClinicalRepository;
  const app = await buildApi({ secret: 'test-secret-long-enough-for-authentication', origin: 'http://localhost:5173', geminiKey: 'fake', geminiModel: 'test' } as Config, repository);
  const payload = { question: 'open latest', recordings: [recording] };
  expect((await app.inject({ method: 'POST', url: '/api/ask-remotion/chat', payload })).statusCode).toBe(401);
  expect((await app.inject({ method: 'POST', url: '/api/ask-remotion/chat', payload: { ...payload, patientId: '00000000-0000-4000-8000-000000000001' } })).statusCode).toBe(401);
  expect(repository.sessions).not.toHaveBeenCalled();
  await app.close();
});
