import type { HandSide } from './types';

export type LessonCommand =
  | { type: 'hand'; hand: HandSide }
  | { type: 'ready' | 'stop' | 'retry' | 'review' | 'reference' | 'recalibrate' }
  | { type: 'pace'; seconds: number }
  | { type: 'angles'; values: [number, number, number] };

/** Only explicit user replies drive transitions; AI captions never execute actions. */
export function parseLessonReply(reply: string): LessonCommand | null {
  const text = reply.toLowerCase().replace(/[’']/g, '').replace(/[.,!?]/g, '').trim();
  if (/\b(stop|pause)\b|\b(pain|hurts|uncomfortable)\b/.test(text)) return { type: 'stop' };
  if (/\b(not|dont|do not|wait|later)\b/.test(text)) return null;
  const hand = text.match(/^(?:(?:my|the|i am using my|im using my|i am showing my|im showing my|ill use my|use my) )?(left|right)(?: hand)?(?: only)?$/);
  if (hand) return { type: 'hand', hand: hand[1] === 'left' ? 'Left' : 'Right' };
  if (/^(?:im |i am )?ready$|^(?:begin|start|begin practice|start practice|lets begin|lets start|capture|capture neutral|capture target)$/.test(text)) return { type: 'ready' };
  if (/^(?:retry|try again|retry camera|reconnect camera)$/.test(text)) return { type: 'retry' };
  if (/^(?:review|see my movement|show my movement)$/.test(text)) return { type: 'review' };
  if (/^(?:use |choose |import )?(?:a )?reference video$/.test(text)) return { type: 'reference' };
  if (/^(?:recalibrate|start over)$/.test(text)) return { type: 'recalibrate' };
  const pace = text.match(/^(?:pace |use )?(6|8|10|six|eight|ten) seconds(?: per repetition)?$/);
  if (pace) return { type: 'pace', seconds: ({ six: 6, eight: 8, ten: 10 } as Record<string, number>)[pace[1]] ?? Number(pace[1]) };
  const angles = text.match(/^target angles (\d+) (\d+) (\d+)$/);
  if (angles) return { type: 'angles', values: angles.slice(1).map(Number) as [number, number, number] };
  return null;
}
