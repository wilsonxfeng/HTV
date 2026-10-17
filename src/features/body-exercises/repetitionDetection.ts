import type { Repetition } from '../movement-echoes/types';
export interface MovementSample { tMs:number;value:number|null;valid:boolean }
/** Complete low → peak → low cycles. Missing observations reset the cycle, never bridge a gap. */
export function detectBodyRepetitions(frames:MovementSample[],minimumExcursion=8):Repetition[] {
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
  return reps;
}
