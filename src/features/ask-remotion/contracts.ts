export const fingerPairLabels = { finger_thumb_index:'Thumb–Index', finger_index_middle:'Index–Middle', finger_middle_ring:'Middle–Ring', finger_ring_pinky:'Ring–Pinky' } as const;
export const metricCatalog = {
  finger_thumb_index: { exerciseId:'finger-spread-close', label:'Thumb–index achieved hold angle (session aggregate)',unit:'°' },
  finger_index_middle: { exerciseId:'finger-spread-close', label:'Index–middle achieved hold angle (session aggregate)',unit:'°' },
  finger_middle_ring: { exerciseId:'finger-spread-close', label:'Middle–ring achieved hold angle (session aggregate)',unit:'°' },
  finger_ring_pinky: { exerciseId:'finger-spread-close', label:'Ring–pinky achieved hold angle (session aggregate)',unit:'°' },
  finger_opening: { exerciseId: 'finger-spread-close', label: 'Mean index–middle, middle–ring and ring–pinky separation at a detected repetition peak', unit: '°' },
  knee_range: { exerciseId: 'seated-knee-extension', label: 'Recorded knee-angle range across the session', unit: '°' },
  knee_peak: { exerciseId: 'seated-knee-extension', label: 'Maximum recorded knee angle', unit: '°' },
  elbow_range: { exerciseId: 'unweighted-bicep-curl', label: 'Recorded elbow-flexion range across the session', unit: '°' },
} as const;
export type MetricKey = keyof typeof metricCatalog;
export interface SearchIntent { type: 'find_extreme' | 'compare_sessions' | 'find_recent' | 'unsupported'; metricKey: MetricKey; aggregation: 'min' | 'max' | 'first' | 'latest'; side: 'Left' | 'Right' }
export type SearchPreset = 'greatest-finger' | 'first-latest-finger' | 'smallest-knee';
export interface Evidence { side: 'Left' | 'Right' | 'Unconfirmed'; sessionId: string; repetitionIndex: number | null; timestampMs: number | null; recordedAt: string; exerciseId: string; metricKey: MetricKey; metricValue: number; metricUnit: string; qualityStatus: string; playable: boolean }
export interface SearchResult { status: 'ok' | 'empty' | 'unsupported'; source: 'preset' | 'gemini'; message: string; metricLabel: string; evidence: Evidence[]; action: { type: 'focus_session' | 'compare_sessions'; sessionIds: string[]; pause: true } | null }
export interface EvidenceFocus { sessionId: string; timestampMs: number | null; repetitionIndex: number | null; token: number }
