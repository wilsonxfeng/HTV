import { Suspense, lazy, useEffect } from 'react';
import { ArrowRight, ChartNoAxesCombined, Flower2, Hand, House, Info, Leaf, Play, ShieldCheck, Sun, X } from 'lucide-react';
import { useApp } from './lib/store';
import type { Page } from './lib/store';
import { createDemoSession } from './lib/demo';
import { gardenProgress } from './lib/garden';
import Garden, { GardenScene, WeekCalendar } from './components/Garden';
const ExerciseFlow=lazy(()=>import('./components/ExerciseFlow'));
const Studio=lazy(()=>import('./components/Studio'));
const Progress=lazy(()=>import('./components/Progress'));
const tabs=[{page:'home',label:'Home',Icon:House},{page:'exercise',label:'Practice',Icon:Hand},{page:'garden',label:'Garden',Icon:Flower2},{page:'progress',label:'Progress',Icon:ChartNoAxesCombined}] as const;
export default function App(){
 const {page,navigate,session,sessions,load,openSession,save,notice,clearNotice}=useApp();
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{window.scrollTo(0,0);document.title=`ReMotion · ${{home:'Home',exercise:'Practice',garden:'Garden',progress:'Progress',history:'Journal',clinician:'Clinician preview',studio:'Your movement',about:'About'}[page]}`},[page]);
 useEffect(()=>{if(!notice)return;const t=window.setTimeout(clearNotice,6500);return()=>clearTimeout(t)},[notice,clearNotice]);
 const sample=()=>openSession(createDemoSession());const garden=gardenProgress(sessions);
 const greeting=new Date().getHours()<12?'Good morning':new Date().getHours()<18?'Good afternoon':'Good evening';
 const isFocused=page==='exercise'||page==='studio';
 return <div className={`app-shell ${isFocused?'focused-shell':''}`}><a className="skip-link" href="#main">Skip to content</a>
 <header className="app-header"><button className="brand" onClick={()=>navigate('home')} aria-label="ReMotion home"><span className="brand-leaf"><Leaf size={27}/></span>ReMotion<span className="brand-dot">.</span></button><span className="header-note">A little care. A little growth.</span><button className="icon-button about-button" onClick={()=>navigate('about')} aria-label="About ReMotion"><Info size={23}/></button></header>
 <main id="main" className="main-content"><Suspense fallback={<div className="loading-screen"><span className="loader"/>Getting your space ready…</div>}>
 {page==='home'&&<div className="home-page content-page page-enter"><div className="home-welcome"><p className="greeting">{greeting}<Sun size={22}/></p><h1>Little by little,<br/>you’re growing.</h1></div><div className="home-layout"><section className="home-garden"><GardenScene sessions={sessions} compact/><div className="home-garden-caption"><div><h2>{garden.waters?'Your garden is looking lovely.':'Something lovely starts here.'}</h2><p>Every practice day helps it grow.</p></div><button className="icon-button" onClick={()=>navigate('garden')} aria-label="Visit my garden"><ArrowRight size={23}/></button></div></section>
 <div className="home-practice"><section className="today-card"><div className="today-label"><span className="icon-tile"><Hand size={24}/></span><span>TODAY, AT YOUR PACE</span><span className="small-flower"><Flower2 size={26}/></span></div><h2>Finger Spread & Close</h2><p>A gentle rhythm. A range that’s yours.</p><div className="practice-meta"><span>3 guided repetitions</span><span>About 30 seconds</span></div><button className="btn btn-primary full" onClick={()=>navigate('exercise')}>Start today’s exercise<ArrowRight size={20}/></button></section><WeekCalendar sessions={sessions}/></div></div>
 <section className="home-bottom"><button className="sample-card" onClick={sample}><span className="icon-tile"><Play size={24}/></span><div><h2>A little look before you begin</h2><p>Explore a sample movement in 3D.</p></div><ArrowRight size={22}/></button><div className="home-reassurance"><ShieldCheck size={22}/><p>Your camera stays yours.<br/><span>Recordings are saved on this device.</span></p></div></section></div>}
 {page==='exercise'&&<ExerciseFlow onBack={()=>navigate('home')} onComplete={s=>{openSession(s);void save(s)}}/>}
 {page==='studio'&&session&&<Studio session={session}/>}
 {page==='garden'&&<Garden/>}
 {(page==='progress'||page==='history'||page==='clinician')&&<Progress clinician={page==='clinician'}/>}
 {page==='about'&&<div className="content-page about-page"><p className="eyebrow">MADE FOR YOUR OWN PACE</p><h1>A little movement.<br/>A personal reference.</h1><div className="about-grid"><article className="panel"><Hand/><h2>Your comfortable range</h2><p>Slowly spread your fingers, hold, then bring them together. Follow your clinician’s instructions and stop if uncomfortable. Your measured neutral pose and comfortable target guide the comparison.</p></article><article className="panel"><Leaf/><h2>A garden of participation</h2><p>A completed practice day waters one plant. Four practice days grow a flower. Extra repetitions do not earn extra growth. Rest days never take flowers away.</p></article><article className="panel"><ShieldCheck/><h2>Private on this device</h2><p>Camera video is processed locally and never saved or uploaded. If you start the optional voice coach, microphone audio and your exercise step are shared with ElevenLabs. Landmark recordings are stored in this browser. You can export or delete them from Progress. Clearing browser data removes recordings and their garden progress.</p></article><article className="panel"><Info/><h2>A technology demonstration</h2><p>The 3D hand and angles are estimates from MediaPipe. This is not an anatomical scan, clinical assessment or treatment. Goal attainment and flower counts do not measure neurological recovery.</p></article></div><button className="btn btn-primary" onClick={()=>navigate('home')}>Back to my home<ArrowRight/></button></div>}
 </Suspense></main>
 {!isFocused&&<nav className="bottom-nav" aria-label="Main navigation">{tabs.map(({page:target,label,Icon})=><button key={target} className={page===target||target==='progress'&&['history','clinician'].includes(page)?'active':''} aria-current={page===target?'page':undefined} onClick={()=>navigate(target as Page)}><Icon size={24} strokeWidth={1.8}/><span>{label}</span></button>)}</nav>}
 {notice&&<div className="toast" role="status"><ShieldCheck size={22}/><span>{notice}</span><button className="icon-button" onClick={clearNotice} aria-label="Dismiss notification"><X size={20}/></button></div>}
 </div>;
}
