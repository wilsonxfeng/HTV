import { Suspense, lazy, useEffect } from 'react';
import { ArrowRight, ChartNoAxesCombined, Flower2, Hand, House, Info, Leaf, Play, ShieldCheck, X } from 'lucide-react';
import { useApp } from './lib/store';
import type { Page } from './lib/store';
import { createDemoSession } from './lib/demo';
import Garden, { GardenScene, WeekCalendar } from './components/Garden';
const ExerciseFlow=lazy(()=>import('./features/body-exercises/Practice'));
const BodySessionReview=lazy(()=>import('./features/body-exercises/BodySessionReview'));
const Studio=lazy(()=>import('./components/Studio'));
const Progress=lazy(()=>import('./components/Progress'));
const tabs=[{page:'home',label:'Home',Icon:House},{page:'exercise',label:'Practice',Icon:Hand},{page:'garden',label:'Garden',Icon:Flower2},{page:'progress',label:'Progress',Icon:ChartNoAxesCombined}] as const;
export default function App(){
 const {page,navigate,session,sessions,load,openSession,save,notice,clearNotice}=useApp();
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{window.scrollTo(0,0);document.title=`ReMotion · ${{home:'Home',exercise:'Practice',garden:'Garden',progress:'Progress',history:'Journal',studio:'Your movement',about:'About'}[page]}`},[page]);
 useEffect(()=>{if(!notice)return;const t=window.setTimeout(clearNotice,6500);return()=>clearTimeout(t)},[notice,clearNotice]);
 const sample=()=>openSession(createDemoSession());
 const isFocused=page==='exercise'||page==='studio';
 return <div className={`app-shell ${isFocused?'focused-shell':''}`}><a className="skip-link" href="#main">Skip to content</a>
 <header className="app-header"><button className="brand" onClick={()=>navigate('home')} aria-label="ReMotion home"><span className="brand-leaf"><Leaf size={27}/></span>ReMotion<span className="brand-dot">.</span></button><button className="icon-button about-button" onClick={()=>navigate('about')} aria-label="About ReMotion"><Info size={23}/></button></header>
 <main id="main" className="main-content"><Suspense fallback={<div className="loading-screen"><span className="loader"/>Loading…</div>}>
 {page==='home'&&<div className="home-page content-page page-enter"><div className="home-welcome"><h1>Home</h1></div><div className="home-layout"><section className="home-garden"><GardenScene sessions={sessions} compact/><button className="icon-button home-garden-link" onClick={()=>navigate('garden')} aria-label="Visit my garden"><ArrowRight size={23}/></button></section>
 <div className="home-practice"><section className="today-card"><div className="today-label"><span className="icon-tile"><Hand size={24}/></span><h2>Practice</h2><span className="small-flower"><Flower2 size={26}/></span></div><button className="btn btn-primary full" onClick={()=>navigate('exercise')}>Choose exercise<ArrowRight size={20}/></button></section><WeekCalendar sessions={sessions}/></div></div>
 <section className="home-bottom"><button className="sample-card" onClick={sample}><span className="icon-tile"><Play size={24}/></span><div><h2>Explore 3D sample</h2></div><ArrowRight size={22}/></button></section></div>}
 {page==='exercise'&&<ExerciseFlow onBack={()=>navigate('home')} onRecorded={s=>void save(s)} onComplete={openSession}/>}
 {page==='studio'&&session&&(session.trackingMode==='pose'?<BodySessionReview session={session}/>:<Studio session={session}/>)}
 {page==='garden'&&<Garden/>}
 {(page==='progress'||page==='history')&&<Progress/>}
 {page==='about'&&<div className="content-page about-page"><h1>About ReMotion</h1><div className="about-grid"><article className="panel"><Hand/><h2>Practice</h2><p>Follow your clinician’s range and stop if uncomfortable. Compare recordings with your measured or prescribed target.</p></article><article className="panel"><Leaf/><h2>Garden</h2><p>Each completed practice session grows a flower.</p></article><article className="panel"><ShieldCheck/><h2>Your data</h2><p>Landmarks stay in this browser. With synced history connected and your consent, silent video and movement data also upload for review in Progress. ElevenLabs receives microphone audio and lesson progress. Export or delete local sessions in Progress; manage local videos in their sharing or Movement Echoes panels.</p></article><article className="panel"><Info/><h2>Measurement limits</h2><p>3D landmarks and angles are estimates, not a clinical assessment or treatment. Target attainment and garden growth do not measure recovery.</p></article></div><button className="btn btn-primary" onClick={()=>navigate('home')}>Home<ArrowRight/></button></div>}
 </Suspense></main>
 {!isFocused&&<nav className="bottom-nav" aria-label="Main navigation">{tabs.map(({page:target,label,Icon})=><button key={target} className={page===target||target==='progress'&&page==='history'?'active':''} aria-current={page===target?'page':undefined} onClick={()=>navigate(target as Page)}><Icon size={24} strokeWidth={1.8}/><span>{label}</span></button>)}</nav>}
 {notice&&<div className="toast" role="status"><ShieldCheck size={22}/><span>{notice}</span><button className="icon-button" onClick={clearNotice} aria-label="Dismiss notification"><X size={20}/></button></div>}
 </div>;
}
