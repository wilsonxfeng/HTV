import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import type { GeneratedReport, SessionDetail, SessionRecord } from '../src/features/clinical-data/contracts';
import { reportSchema, HttpError } from './validation';
import { digest } from './repository';

export interface ReportGenerator { generate(current: SessionDetail, previous: SessionRecord[]): Promise<GeneratedReport> }
export const reportRule = 'Summarize only supplied movement metrics. Never invent measurements, diagnose stroke recovery, claim clinical improvement, or recommend changing prescribed exercises. Flag incomplete or low-quality recordings. Do not infer causes, prognosis, adherence, treatment, or patient identity. Use only numeric values from the supplied facts, rounded to at most one decimal place. Summarize a few relevant values rather than enumerating every metric. Distinguish detected repetitions from timed hold windows. Keep the patient summary to two sentences and the clinician summary to four. Include limitations even when tracking is high.';
export function comparableTarget(session: SessionDetail) {
  if(session.trackingMode==='pose')return digest({exerciseId:session.exerciseId,side:session.hand,cameraView:session.cameraView,analysisVersion:session.analysisVersion});
  const c = session.motion.calibration;
  return digest({ neutral: c.neutral, target: c.target, source: c.source });
}

export class GeminiReports implements ReportGenerator {
  private ai: GoogleGenAI;
  constructor(key: string, private model: string) { this.ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 20000 } }); }
  async generate(current: SessionDetail, previous: SessionRecord[]): Promise<GeneratedReport> {
    const metrics = (session: SessionRecord) => session.metrics ? session.metrics.body ? {body:session.metrics.body,trackingQuality:session.metrics.trackingQuality,validFrames:session.metrics.validFrames} : { pairs: session.metrics.pairs, targetAttainment: session.metrics.targetAttainment, trackingQuality: session.metrics.trackingQuality, validFrames: session.metrics.validFrames, trackedHoldWindows: session.metrics.repetitions, differences: session.metrics.deviations.map(({ t, pair, difference, actual, target }) => ({ t, pair, difference, actual, target })) } : null;
    const facts = { current: { metrics: metrics(current), detectedRepetitions: current.repetitions.length, completed: current.motion.completed, demonstration: current.demonstration }, previous: previous.map(s => ({ metrics: metrics(s), detectedRepetitions: s.repetitions.length })), limitations: ['Camera-estimated angles, not clinical joint measurements.', 'Tracking coverage is not measurement accuracy.', 'Only comparable exercise, side, viewpoint and analysis settings are included.'] };
    try {
      const response = await this.ai.models.generateContent({ model: this.model, contents: JSON.stringify(facts), config: { systemInstruction: reportRule, responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(reportSchema), thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, maxOutputTokens: 2500, temperature: 0.1 } });
      const parsed = reportSchema.parse(JSON.parse(response.text ?? ''));
      const narrative = `${parsed.patientSummary} ${parsed.clinicianSummary}`;
      // Reject clinical assertions and obvious invented numbers; the original metrics remain authoritative.
      if (/\b(diagnos\w*|recovery|improv\w*|prognos\w*|prescrib\w*|increase your|reduce your)\b/i.test(narrative)) throw Error('Unsupported clinical language');
      const numbers = new Set((JSON.stringify(facts).match(/-?\d+(?:\.\d+)?/g) ?? []).flatMap(n => [String(Number(n)), Number(n).toFixed(1), String(Math.round(Number(n)))]));
      if ((narrative.match(/-?\d+(?:\.\d+)?/g) ?? []).some(n => !numbers.has(n))) throw Error('Unsupported numeric claim');
      return { ...parsed, modelVersion: response.modelVersion ?? this.model, createdAt: new Date().toISOString() };
    } catch { throw new HttpError(503, 'AI summary unavailable. The recording and measurements are saved; try again later.'); }
  }
}
