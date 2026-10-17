import { Suspense, lazy, useMemo, useState } from 'react';
import { ArrowRight, Layers, Stethoscope } from 'lucide-react';
import { useApp } from '../lib/store';
import { analyzeSession } from '../lib/analysis';
import { WeekCalendar } from './Garden';
import History from './History';
const MovementEchoes=lazy(()=>import('../features/movement-echoes/MovementEchoes'));
export default function Progress() {
 const [showEchoes,setShowEchoes]=useState(false);
 const {sessions,navigate}=useApp();const [hand,setHand]=useState<'Right'|'Left'>('Right');
 const measured=useMemo(()=>sessions.filter(s=>s.source==='camera'&&s.trackingMode!=='pose'&&s.hand===hand).map(s=>({session:s,pair:analyzeSession(s).pairs.find(p=>p.pair==='Index–Middle')})).filter(s=>s.pair).sort((a,b)=>a.session.createdAt.localeCompare(b.session.createdAt)).slice(-8),[sessions,hand]);
 const max=Math.max(30,...measured.map(m=>m.pair!.achieved+5));
 const x=(i:number)=>measured.length===1?160:44+i/(measured.length-1)*232;const y=(v:number)=>154-v/max*115;
 if(showEchoes)return <Suspense fallback={<p role="status">Opening Movement Echoes…</p>}><MovementEchoes onDeleted={async id=>{if(sessions.find(s=>s.id===id)?.trackingMode==='pose')await useApp.getState().remove(id);}} onClose={()=>{setShowEchoes(false);window.scrollTo(0,0)}}/></Suspense>;
 return <div className="progress-page content-page page-enter"><div className="page-heading"><div><h1>Progress</h1></div><img className="progress-flower" src="/assets/garden/stage-4.webp" alt=""/></div>
 <WeekCalendar sessions={sessions}/>
 <button className="sample-card" onClick={()=>{setShowEchoes(true);window.scrollTo(0,0)}}><Layers size={26}/><div><h2>Movement Echoes</h2><p>Compare your recorded movement.</p></div><ArrowRight size={21}/></button>
 <section className="movement-trend panel"><div className="section-heading"><div><h2>Finger opening</h2></div><select aria-label="Hand shown in movement chart" value={hand} onChange={e=>setHand(e.target.value as 'Right'|'Left')}><option>Right</option><option>Left</option></select></div><p>Index–middle · Estimated hold angle</p>
 {measured.length?<><svg className="progress-chart" viewBox="0 0 320 200" role="img" aria-label={`Recorded ${hand.toLowerCase()} hand opening across ${measured.length} sessions, in estimated degrees`}><title>Estimated index and middle finger opening</title>{[0,max/2,max].map(v=><g key={v}><line x1="44" x2="286" y1={y(v)} y2={y(v)} stroke="#d9dfd3"/><text x="3" y={y(v)+5}>{Math.round(v)}°</text></g>)}<polyline points={measured.map((m,i)=>`${x(i)},${y(m.pair!.achieved)}`).join(' ')} stroke="#426348" strokeWidth="3" fill="none"/>{measured.map((m,i)=><g key={m.session.id}><circle cx={x(i)} cy={y(m.pair!.achieved)} r="5" fill="#426348"/><title>{new Date(m.session.createdAt).toLocaleDateString()}: {m.pair!.achieved.toFixed(1)} degrees</title></g>)}<text x="44" y="187">{new Date(measured[0].session.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</text>{measured.length>1&&<text x="280" y="187" textAnchor="end">{new Date(measured.at(-1)!.session.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</text>}</svg><p>{measured.length>1?`Recorded opening: ${measured[0].pair!.achieved.toFixed(1)}° to ${measured.at(-1)!.pair!.achieved.toFixed(1)}° across these sessions.`:'1 recorded session'}</p><details><summary>See chart values</summary><ul>{measured.map(m=><li key={m.session.id}>{new Date(m.session.createdAt).toLocaleString()}: {m.pair!.achieved.toFixed(1)}°</li>)}</ul></details></>:<div className="trend-empty"><SproutArt/><h3>No measurements yet</h3><p>Complete a recording with tracked holds.</p><button className="text-button" onClick={()=>navigate('exercise')}>Practice<ArrowRight size={17}/></button></div>}
 {measured.length>0&&<p className="quiet">Angles depend on target and camera position. This is not a recovery score.</p>}</section>
 <History compact/>
 <button className="clinician-link" onClick={()=>navigate('clinician')}><Stethoscope size={21}/>Clinician dashboard<ArrowRight size={18}/></button></div>;
}
function SproutArt(){return <img className="empty-plant" src="/assets/garden/stage-1.webp" alt=""/>;}
