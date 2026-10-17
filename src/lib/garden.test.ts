import { describe, expect, it } from 'vitest';
import { createDemoSession } from './demo';
import { dayKey, gardenProgress, isCompletedPractice, practiceStreak, weekDays } from './garden';
import type { MotionSession } from './types';
function recording(day=1):MotionSession {return {...createDemoSession(),id:`practice-${day}`,createdAt:new Date(2026,9,day,12).toISOString(),source:'camera',completed:true};}
describe('participation garden',()=>{
 it('excludes samples, interrupted sessions and sessions without tracking',()=>{
 const s=recording();expect(gardenProgress([createDemoSession(),{...s,completed:false},{...s,duration:5},{...s,frames:[]}]).waters).toBe(0);
 });
 it('waters once per local calendar day, even after repeated saves or extra practice',()=>{
 const s=recording();const p=gardenProgress([s,s,{...s,id:'second'}]);expect(p.waters).toBe(1);expect(p.stage).toBe(1);expect(p.blooms).toBe(0);
 });
 it('blooms after four practice days and starts another seed without losing old flowers',()=>{
 const p=gardenProgress([recording(1),recording(4),recording(8),recording(11)]);expect(p.blooms).toBe(1);expect(p.stage).toBe(0);expect(p.completed).toHaveLength(4);
 });
 it('supports completed legacy recordings without migrating their data',()=>{
 const {completed:_,...legacy}=recording();expect(isCompletedPractice(legacy)).toBe(true);
 });
 it('uses local days and a Monday-based week across month boundaries',()=>{
 const days=weekDays(new Date(2026,10,1));expect(dayKey(days[0])).toBe('2026-10-26');expect(dayKey(days[6])).toBe('2026-11-01');expect(practiceStreak(['2026-10-30','2026-10-31'],new Date(2026,10,1))).toBe(2);
 });
});
