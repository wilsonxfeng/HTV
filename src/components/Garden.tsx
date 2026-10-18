import { useState } from 'react';
import { ArrowRight, Check, Flower2, Sprout, Sun, X } from 'lucide-react';
import { useApp } from '../lib/store';
import { dayKey, gardenProgress, STAGES, weekDays } from '../lib/garden';
import type { MotionSession } from '../lib/types';
const asset = (name:string) => `/assets/garden/${name}.webp`;
export function WeekCalendar({sessions}:{sessions:MotionSession[]}) {
 const {days}=gardenProgress(sessions); const week=weekDays(); const count=week.filter(d=>days.includes(dayKey(d))).length;
 return <section className="week-card"><div className="section-heading"><h2>This week</h2><span>{count} {count===1?'day':'days'} of practice</span></div><div className="week-days">{week.map(d=>{const complete=days.includes(dayKey(d));return <div key={dayKey(d)} className={dayKey(d)===dayKey(new Date())?'today':''}><span>{d.toLocaleDateString('en',{weekday:'short'}).slice(0,1)}</span><span className={`day-circle ${complete?'complete':''}`} aria-label={`${d.toLocaleDateString()}: ${complete?'practice completed':'no completed practice'}`}>{complete?<Check size={20}/>:d.getDate()}</span></div>})}</div></section>;
}
export function GardenScene({sessions, compact=false, example=false, celebrate=false}:{sessions:MotionSession[];compact?:boolean;example?:boolean;celebrate?:boolean}) {
 const progress=gardenProgress(sessions);const blooms=example?5:progress.blooms; const stage=example?2:progress.stage;
 const [selected,setSelected]=useState<number|null>(null);
 const plants=Array.from({length:Math.min(blooms,8)},(_,i)=>({stage:4,x:13+(i%4)*24,y:8+Math.floor(i/4)*23}));
 const current={stage,x:plants.length<4?13+plants.length*24:49,y:plants.length<4?8:8+Math.min(2,Math.floor(plants.length/4))*23};
 return <div className={`garden-scene ${compact?'compact':''} ${celebrate?'is-watering':''}`} aria-label={`${example?'Example garden': 'Your garden'}: ${blooms} flowers, current plant ${STAGES[stage]}`}>
  <img className="garden-landscape" src={asset('background')} alt=""/>
  <span className="garden-sun"><Sun size={28} strokeWidth={1.3}/></span>
  {[...plants,current].map((p,i)=><button key={i} className={`garden-plant plant-${p.stage}`} style={{left:`${p.x}%`,bottom:`${p.y}%`}} onClick={()=>setSelected(selected===i?null:i)} aria-label={`${i<plants.length?'Flower '+(i+1):'Current plant'}: ${STAGES[p.stage]}`}><img src={asset(p.stage===4&&i%3>0?`flower-${i%3}`:`stage-${p.stage}`)} alt=""/>{selected===i&&<span className="plant-label">{STAGES[p.stage]}</span>}</button>)}
  {celebrate&&<div className="watering-effect" aria-hidden="true"><img src={asset('watering-can')} alt=""/><i/><i/><i/></div>}
 </div>;
}
export default function Garden() {
 const {sessions,navigate,gardenReward,clearGardenReward}=useApp(); const progress=gardenProgress(sessions);
 return <div className="garden-page content-page page-enter"><div className="page-heading"><div><h1>Garden</h1></div></div>
 {gardenReward&&<section className="garden-celebration" role="status"><button className="icon-button" aria-label="Dismiss garden celebration" onClick={clearGardenReward}><X/></button><h2>A flower grew</h2></section>}
 <div className="garden-layout"><section className="garden-main"><GardenScene sessions={sessions} celebrate={!!gardenReward}/></section>
 <div className="garden-side"><section className="plant-progress panel"><div className="section-heading"><h2>Next flower</h2><Sprout size={25}/></div><p>One completed session grows a flower.</p><button className="btn btn-primary full" onClick={()=>navigate('exercise')}>Practice<ArrowRight size={19}/></button></section>
 <div className="garden-stats"><div><Flower2/><strong>{progress.blooms}</strong><span>flowers grown</span></div><div><Check/><strong>{progress.completed.length}</strong><span>sessions completed</span></div></div><WeekCalendar sessions={sessions}/></div></div>
 </div>;
}
