import { describe, expect, it, vi } from 'vitest';
import { analyzeSession } from '../src/lib/analysis';
import { createDemoSession } from '../src/lib/demo';
import { GeminiReports } from './reports';
import type { SessionDetail } from '../src/features/clinical-data/contracts';
const mock = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: mock.generate }; } }));
function recording(): SessionDetail {
  const motion = createDemoSession();
  return { id: motion.id, patientId: 'never-send-patient-id', startedAt: motion.createdAt, exerciseId: 'finger-spread-close', hand: motion.hand, demonstration: true, videoKind: 'synthetic', video: { mimeType:'video/mp4',sizeBytes:1,sha256:'a'.repeat(64),width:640,height:480,durationMs:24000,landmarkOffsetMs:0,mirrored:false }, status:'complete',metrics:analyzeSession(motion),motion,repetitions:[],report:null };
}
describe('grounded Gemini reports', () => {
  it('sends only measured facts, validates structured output and records model provenance', async () => {
    const current = recording();
    mock.generate.mockResolvedValue({ text: JSON.stringify({ patientSummary:'Your recorded hold measurements are available.',clinicianSummary:'Review the measured finger-pair angles and recording coverage.',limitations:['Camera-estimated angles are not clinical joint measurements.'] }),modelVersion:'verified-provider-model' });
    const report = await new GeminiReports('not-a-real-key','gemini-3.8-flash').generate(current,[]);
    expect(report.modelVersion).toBe('verified-provider-model');
    const request = mock.generate.mock.calls.at(-1)![0];
    expect(request.contents).not.toContain(current.patientId);
    expect(request.contents).not.toContain('"landmarks"');
    expect(JSON.parse(request.contents).current.metrics.trackingQuality).toBe(current.metrics!.trackingQuality);
    expect(request.config.systemInstruction).toContain('Never invent measurements');
    expect(request.config.responseMimeType).toBe('application/json');
  });
  it.each([
    { patientSummary:'Your measured opening was 9999 degrees.',clinicianSummary:'Review recording.',limitations:['Estimated.'] },
    { patientSummary:'Your recovery improved.',clinicianSummary:'Review recording.',limitations:['Estimated.'] },
    { patientSummary:'Missing required fields.' },
  ])('rejects unsupported numbers, clinical claims and invalid JSON shape', async output => {
    mock.generate.mockResolvedValue({ text:JSON.stringify(output) });
    await expect(new GeminiReports('test','gemini-3.8-flash').generate(recording(),[])).rejects.toThrow('AI summary unavailable');
  });
  it('keeps provider errors independent of saved metrics', async () => {
    const current=recording(),before=JSON.stringify(current.metrics);
    mock.generate.mockRejectedValue(Error('quota provider detail'));
    await expect(new GeminiReports('test','gemini-3.8-flash').generate(current,[])).rejects.toThrow('The recording and measurements are saved');
    expect(JSON.stringify(current.metrics)).toBe(before);
  });
});
