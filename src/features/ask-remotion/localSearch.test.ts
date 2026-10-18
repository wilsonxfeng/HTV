import { describe, expect, it } from 'vitest';
import { clientReply, GREATEST_FINGER_REPLY, isGreatestFingerQuestion, searchRecordings } from './localSearch';
import type { EchoSession } from '../movement-echoes/types';
function clip(id: string, value: number): EchoSession {
  return { id, name: id, exerciseId: 'finger-spread-close', selectedHand: 'Right', createdAt: '2026-10-17T10:00:00Z', mirrored: false, demonstration: true, video: new Blob(['video']), videoWidth: 640, videoHeight: 480, videoDurationMs: 10000, landmarkOffsetMs: 0, sourceFingerprint: id,
    frames: Array.from({ length: 101 }, (_, i) => ({ tMs: i * 100, valid: true, spread: value * i / 100, image: [], world: [] })),
    repetitions: [{ startMs: 1000, peakMs: 4300, endMs: 6000, peakSpread: value, coverage: 1, valid: true }] };
}
describe('scripted greatest-opening demo', () => {
  it('recognizes the typed question with formatting and punctuation', () => {
    expect(isGreatestFingerQuestion('*Which session had the greatest recorded finger opening?')).toBe(true);
    expect(isGreatestFingerQuestion(' WHICH session had the greatest recorded finger opening?! ')).toBe(true);
    expect(isGreatestFingerQuestion('Which session had the smallest finger opening?')).toBe(false);
  });
  it('selects by measured separation and changes selection when the measurements change', () => {
    const misleading = clip('higher-ROM-name', 12), greatest = clip('ordinary-name', 28);
    const answer = searchRecordings([misleading, greatest], misleading.id, 'greatest-finger');
    expect(answer.evidence[0]).toMatchObject({ sessionId: greatest.id, metricValue: 28, timestampMs: 4300, repetitionIndex: 0 });
    expect(clientReply(answer, 'greatest-finger')).toBe(GREATEST_FINGER_REPLY);
    misleading.repetitions[0].peakSpread = 35;
    expect(searchRecordings([misleading, greatest], greatest.id, 'greatest-finger').evidence[0].sessionId).toBe(misleading.id);
  });
  it('excludes static, poor-tracking, wrong-side and invalid peak recordings', () => {
    const actual = clip('eligible', 20), still = clip('still', 99), poor = clip('poor', 90), left = { ...clip('left', 80), selectedHand: 'Left' as const }, invalid = clip('invalid', 70);
    still.repetitions[0].static = true; poor.frames = poor.frames.slice(0, 20); invalid.repetitions[0].peakMs = 20000;
    expect(searchRecordings([actual, still, poor, left, invalid], actual.id, 'greatest-finger').evidence.map(e => e.sessionId)).toEqual(['eligible']);
  });
  it('supports explicitly grouped demo hands without inventing physical hand identity', () => {
    const a = { ...clip('a', 14), selectedHand: 'Unconfirmed' as const, comparisonGroup: 'team-demo' };
    const b = { ...clip('b', 26), selectedHand: 'Unconfirmed' as const, comparisonGroup: 'team-demo' };
    expect(searchRecordings([a, b], a.id, 'greatest-finger').evidence[0]).toMatchObject({ sessionId: 'b', side: 'Unconfirmed' });
  });
  it('returns no result for empty or static-only recordings without claiming a winner', () => {
    const still = clip('still', 40); still.repetitions[0].static = true;
    const result = searchRecordings([still], still.id, 'greatest-finger');
    expect(result.status).toBe('empty'); expect(clientReply(result, 'greatest-finger')).not.toBe(GREATEST_FINGER_REPLY);
  });
});
