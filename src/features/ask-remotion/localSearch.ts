import { compatible } from '../movement-echoes/geometry';
import type { EchoSession } from '../movement-echoes/types';
import { metricCatalog, type Evidence, type SearchPreset, type SearchResult } from './contracts';

export const GREATEST_FINGER_QUESTION = 'Which session had the greatest recorded finger opening?';
export const GREATEST_FINGER_REPLY = 'Absolutely! This session had the greatest recorded finger separation. I’ve brought it into focus for you.';
export function isGreatestFingerQuestion(question: string) {
  return question.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, ' ') === GREATEST_FINGER_QUESTION.toLowerCase().replace('?', '');
}
export function clientReply(result: SearchResult, preset?: SearchPreset) {
  if (result.status === 'unsupported') return 'Try asking about finger opening or knee movement.';
  if (!result.evidence.length) return result.status === 'empty' ? 'I couldn’t find a matching movement in these recordings.' : result.message;
  if (result.evidence.some(e => !e.playable)) return 'I found a matching session, but its video isn’t available.';
  if (preset === 'greatest-finger') return GREATEST_FINGER_REPLY;
  if (result.evidence.length > 1) return 'Here are the first and latest comparable sessions. I’ve brought them together for you.';
  if (preset === 'smallest-knee') return 'Here’s the session with the smallest recorded knee movement. I’ve brought it into focus for you.';
  return 'Here’s the matching session. I’ve brought it into focus for you.';
}

/** Local queries use measured repetitions, never clip names or invented values. */
export function searchRecordings(sessions: EchoSession[], focusId: string, preset: SearchPreset): SearchResult {
  const metricKey = preset === 'smallest-knee' ? 'knee_range' : 'finger_opening';
  const metric = metricCatalog[metricKey];
  const focus = sessions.find(s => s.id === focusId);
  const matching = sessions.filter(s => s.exerciseId === metric.exerciseId);
  const anchor = focus?.exerciseId === metric.exerciseId ? focus : matching.at(-1);
  const cohort = matching.filter(s => anchor && compatible(anchor, s)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const candidates: Evidence[] = cohort.flatMap(session => {
    let trackedMs = 0;
    for (let i = 1; i < session.frames.length; i++) {
      const previous = session.frames[i - 1], current = session.frames[i], gap = current.tMs - previous.tMs;
      if (previous.valid && current.valid && gap > 0 && gap <= 300) trackedMs += gap;
    }
    if (trackedMs / Math.max(1, session.videoDurationMs) < .8) return [];
    const peaks = session.repetitions.flatMap((rep, index) => rep.valid && !rep.static && rep.coverage >= .8 && Number.isFinite(rep.peakSpread) && rep.peakMs >= 0 && rep.peakMs <= session.videoDurationMs ? [{ rep, index }] : []);
    if (!peaks.length) return [];
    const peak = peaks.reduce((a, b) => a.rep.peakSpread >= b.rep.peakSpread ? a : b);
    const values = session.frames.filter(f => f.valid && f.spread !== null && Number.isFinite(f.spread)).map(f => f.spread!);
    if (metricKey === 'knee_range' && !values.length) return [];
    return [{ sessionId: session.id, side: session.selectedHand, exerciseId: session.exerciseId, recordedAt: session.createdAt,
      repetitionIndex: metricKey === 'finger_opening' ? peak.index : null, timestampMs: metricKey === 'finger_opening' ? peak.rep.peakMs : null,
      metricKey, metricValue: metricKey === 'finger_opening' ? peak.rep.peakSpread : Math.max(...values) - Math.min(...values), metricUnit: metric.unit,
      qualityStatus: 'Tracked movement', playable: session.video.size > 0 }];
  });
  const evidence = preset === 'first-latest-finger'
    ? candidates.length >= 2 ? [candidates[0], candidates.at(-1)!] : []
    : candidates.length ? [candidates.reduce((a, b) => preset === 'smallest-knee' ? a.metricValue <= b.metricValue ? a : b : a.metricValue >= b.metricValue ? a : b)] : [];
  return { status: evidence.length ? 'ok' : 'empty', source: 'preset', message: '', metricLabel: metric.label, evidence,
    action: evidence.length ? { type: evidence.length > 1 ? 'compare_sessions' : 'focus_session', sessionIds: evidence.map(e => e.sessionId), pause: true } : null };
}
