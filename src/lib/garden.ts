import type { MotionSession } from './types';
export const STAGES = ['Seed', 'Sprout', 'Growing plant', 'Flower bud', 'Full bloom'];
export const dayKey = (date: Date | string) => { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export function isCompletedPractice(s: MotionSession) {
  if (s.trackingMode === 'pose') return s.source === 'camera' && s.completed === true && s.frames.filter(f => f.tracking && f.landmarks.length === 33).length >= 8;
  return s.source === 'camera' && s.completed !== false && s.duration >= s.cycleDuration * 3 - .2 && s.frames.filter(f => f.tracking && f.landmarks.length === 21).length >= 8;
}
export function gardenProgress(sessions: MotionSession[]) {
  const completed = [...new Map(sessions.filter(isCompletedPractice).map(s => [s.id, s])).values()];
  const days = [...new Set(completed.map(s => dayKey(s.createdAt)))].sort();
  const waters = completed.length;
  const blooms = completed.length;
  const stage = 0;
  return { completed, days, waters, blooms, stage, stageName: STAGES[stage], next: 1 };
}
export function weekDays(now = new Date()) {
  const start = new Date(now); start.setHours(12,0,0,0); start.setDate(start.getDate() - (start.getDay()+6)%7);
  return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
}
export function practiceStreak(days: string[], now = new Date()) {
  const date = new Date(now); date.setHours(12,0,0,0);
  if (!days.includes(dayKey(date))) date.setDate(date.getDate()-1);
  let count=0; while(days.includes(dayKey(date))) { count++; date.setDate(date.getDate()-1); }
  return count;
}
