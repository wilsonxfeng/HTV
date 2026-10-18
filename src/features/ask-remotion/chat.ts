import type { EchoSession } from '../movement-echoes/types';
import type { Evidence } from './contracts';

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface RecordingSummary {
  id: string; name: string; recordedAt: string; exerciseId: string;
  side: EchoSession['selectedHand']; durationMs: number; playable: boolean;
  trackingQuality: number; range: number | null; demonstration: boolean;
  configuration: string;
  repetitions: { index: number; peakMs: number; peak: number; reliable: boolean }[];
}
export interface ChatReply { message: string; evidence: Evidence[] }
export function summarizeRecordings(sessions: EchoSession[]): RecordingSummary[] {
  return sessions.slice(-100).map(s => {
    const values = s.frames.filter(f => f.valid && f.spread !== null && Number.isFinite(f.spread)).map(f => f.spread!);
    let trackedMs = 0;
    for (let i = 1; i < s.frames.length; i++) {
      const a = s.frames[i - 1], b = s.frames[i], gap = b.tMs - a.tMs;
      if (a.valid && b.valid && gap > 0 && gap <= 300) trackedMs += gap;
    }
    return { id: s.id, name: s.name, recordedAt: s.createdAt, exerciseId: s.exerciseId,
      side: s.selectedHand, durationMs: s.videoDurationMs, playable: s.video.size > 0,
      trackingQuality: Math.min(100, 100 * trackedMs / Math.max(1, s.videoDurationMs)),
      range: values.length ? Math.max(...values) - Math.min(...values) : null,
      demonstration: s.demonstration,
      configuration: JSON.stringify([s.exerciseId, s.selectedHand, s.mirrored, s.trackingMode, s.cameraView, s.analysisVersion, s.demonstration, s.comparisonGroup]),
      repetitions: s.repetitions.map((r, index) => ({ index, peakMs: r.peakMs, peak: Number.isFinite(r.peakSpread) ? r.peakSpread : 0,
        reliable: r.valid && !r.static && r.coverage >= .8 && Number.isFinite(r.peakSpread) && r.peakMs >= 0 && r.peakMs <= s.videoDurationMs })) };
  });
}
