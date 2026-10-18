import type { Repetition } from '../movement-echoes/types';
export interface MovementSample { tMs:number;value:number|null;valid:boolean }
/** Complete low → peak → low cycles. Missing observations reset the cycle, never bridge a gap. */
export function detectBodyRepetitions(frames:MovementSample[],minimumExcursion=8,includePartialStart=false):Repetition[] {
  const valid=frames.filter(f=>f.valid&&f.value!==null);
  if(valid.length<10)return [];
  const ordered=valid.map(f=>f.value!).sort((a,b)=>a-b);
  const low=ordered[Math.floor(ordered.length*.1)],high=ordered[Math.floor(ordered.length*.9)];
  if(high-low<minimumExcursion)return [];
  const enter=low+(high-low)*.3,leave=low+(high-low)*.2,reps:Repetition[]=[];
  let start=-1,peak=-1,maximum=-Infinity,active=false,last=-Infinity,windowStart=0;
  for(let i=0;i<frames.length;i++) {
    const frame=frames[i];
    if(!frame.valid||frame.value===null||frame.tMs-last>300){start=-1;peak=-1;active=false;maximum=-Infinity;windowStart=i;}
    last=frame.tMs;
    if(!frame.valid||frame.value===null)continue;
    // Causal median keeps live and saved counting consistent and suppresses single-frame spikes.
    const window=frames.slice(Math.max(windowStart,i-2),i+1).filter(f=>f.valid&&f.value!==null).map(f=>f.value!).sort((a,b)=>a-b);
    const value=window[Math.floor(window.length/2)];
    if(!active) {
      if(value<=leave)start=i;
      else if(start>=0&&value>=enter){active=true;peak=i;maximum=value;}
    } else {
      if(value>maximum){maximum=value;peak=i;}
      if(value<=leave&&frame.tMs-frames[peak].tMs>=250) {
        if(frames[peak].tMs-frames[start].tMs>=250&&maximum-low>=minimumExcursion&&frame.tMs-frames[start].tMs>=900)reps.push({startMs:frames[start].tMs,peakMs:frames[peak].tMs,endMs:frame.tMs,valid:true,coverage:1,peakSpread:maximum});
        active=false;start=i;maximum=-Infinity;
      }
    }
  }
  if (includePartialStart && frames[0]?.valid && frames[0].value !== null && frames[0].value >= enter) {
    let peakIndex = 0;
    for (let i = 1; i < frames.length; i++) {
      const f = frames[i];
      if (!f.valid || f.value === null || f.tMs - frames[i-1].tMs > 300) break;
      if (f.value > frames[peakIndex].value!) peakIndex = i;
      if (f.value <= leave) {
        if (f.tMs - frames[0].tMs >= 900 && frames[peakIndex].value! - f.value >= minimumExcursion)
          reps.unshift({ startMs: frames[0].tMs, peakMs: frames[peakIndex].tMs, endMs: f.tMs, valid: true, coverage: 1, peakSpread: frames[peakIndex].value!, partial: 'start' });
        break;
      }
    }
  }
  return reps.map(rep => ({ ...rep, phaseMap: measuredPhaseMap(frames, rep) }));
}
/** Normalize actual excursion on each side of the peak, rather than stretching elapsed time through pauses. */
function measuredPhaseMap(frames: MovementSample[], rep: Repetition): NonNullable<Repetition['phaseMap']> {
  const cycle = frames.filter(f => f.tMs >= rep.startMs && f.tMs <= rep.endMs && f.valid && f.value !== null);
  const smooth = cycle.map((f, i) => { const values = cycle.slice(Math.max(0, i - 1), i + 2).map(s => s.value!).sort((a,b) => a-b); return { ...f, value: values[Math.floor(values.length / 2)] }; });
  const peak = smooth.findIndex(f => f.tMs === rep.peakMs);
  if (peak < 1 || peak >= smooth.length - 1) return [{ phase: 0, tMs: rep.startMs }, { phase: .5, tMs: rep.peakMs }, { phase: 1, tMs: rep.endMs }];
  const rise = Math.max(.001, smooth[peak].value! - smooth[0].value!);
  const fall = Math.max(.001, smooth[peak].value! - smooth.at(-1)!.value!);
  let progress = 0;
  return smooth.map((f,i) => {
    const value = i <= peak ? rep.partial === 'start' ? .5 : .5 * Math.max(0, Math.min(1, (f.value! - smooth[0].value!) / rise)) : .5 + .5 * Math.max(0, Math.min(1, (smooth[peak].value! - f.value!) / fall));
    progress = Math.max(progress, i === peak ? .5 : i === smooth.length - 1 ? 1 : value);
    return { phase: progress, tMs: f.tMs };
  });
}
