import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CircleHelp, Focus, Maximize2, MousePointer2, Pause, Play, RotateCcw, Save, ScanLine, SkipBack, SkipForward, X } from 'lucide-react';
import type { MotionSession } from '../lib/types';
import { useApp } from '../lib/store';
import { analyzeSession } from '../lib/analysis';
import { frameAt, getPhase, referenceAt } from '../lib/geometry';
import HandStage from './HandStage';
import { exportSession } from '../lib/export';

export default function Studio({ session }: { session: MotionSession }) {
  const { navigate, save, sessions, gardenReward } = useApp();
  const analysis = useMemo(() => analyzeSession(session), [session]);
  const [time, setTime] = useState(Math.min(session.duration, session.cycleDuration * .5));
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1);
  const [recorded, setRecorded] = useState(true), [ghost, setGhost] = useState(true), [vectors, setVectors] = useState(false);
  const [reset, setReset] = useState(0), [selected, setSelected] = useState(analysis.deviations[0]?.id ?? ''), [help, setHelp] = useState(false);
  const [focusPair, setFocusPair] = useState<[number, number] | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setTime(Math.min(session.duration, session.cycleDuration * .5)); setPlaying(false); setSelected(analysis.deviations[0]?.id ?? ''); }, [session, analysis]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, .15) * speed; last = now;
      setTime(t => { if (t + dt >= session.duration) { setPlaying(false); return session.duration; } return t + dt; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, speed, session.duration]);
  const phase = getPhase(Math.min(time, session.duration - .001), session.cycleDuration);
  const frame = frameAt(session.frames, time), reference = referenceAt(session.calibration, time, session.cycleDuration);
  const selectedPair = focusPair ?? analysis.deviations.find(d => d.id === selected)?.indices ?? null;
  const previous = [...analysis.deviations].reverse().find(d => d.t < time - .05), next = analysis.deviations.find(d => d.t > time + .05);
  const jump = (id?: string) => { const event = analysis.deviations.find(d => d.id === id); if (event) { setFocusPair(null); setSelected(event.id); setTime(event.t); setPlaying(false); } };
  const saved = sessions.some(s => s.id === session.id);
  return <div className="studio-page page-enter" ref={shellRef}>
    <div className="studio-heading"><div><button className="back-link" onClick={() => navigate('progress')}><ArrowLeft size={16}/>Back to Progress</button><div className="studio-title-row"><h1>Movement replay</h1><span className="badge">{session.source === 'demo' ? 'SAMPLE SESSION' : 'YOUR RECORDING'}</span></div></div>
      <div className="studio-heading-actions">{!saved && <button className="btn btn-secondary" onClick={() => void save(session)}><Save size={16}/>Save session</button>}<button className="btn btn-secondary" onClick={() => exportSession(session)}><ArrowDownToLine size={16}/>Export</button><button className="btn btn-primary" onClick={() => navigate('exercise')}>New session<ArrowRight size={16}/></button></div>
    </div>
    {session.source === 'demo' && <div className="sample-banner">Synthetic sample · Not a patient recording</div>}
    <section className="stage-column">
      <div className="stage-toolbar"><span>{session.hand} hand</span><div className="stage-toolbar-actions"><button className="icon-button" aria-label="Explain the movement comparison" onClick={() => setHelp(v => !v)}><CircleHelp size={18}/></button><button className="icon-button" aria-label="Toggle full screen" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void shellRef.current?.requestFullscreen().catch(() => {}); }}><Maximize2 size={18}/></button></div></div>
      <div className="stage-view"><HandStage recorded={frame?.tracking ? frame.landmarks : undefined} reference={reference} showRecorded={recorded && !!frame?.tracking} showReference={ghost} showVectors={vectors && !!frame?.tracking} selectedPair={selectedPair} resetKey={reset} hand={session.hand} onSelectFinger={name => {
        const tip = { Thumb: 4, Index: 8, Middle: 12, Ring: 16, Little: 20 }[name];
        const event = analysis.deviations.find(d => d.repetition === phase.repetition && d.indices.includes(tip ?? -1)) ?? analysis.deviations.find(d => d.indices.includes(tip ?? -1));
        if (event) jump(event.id); else { const pair = analysis.pairs.find(p => p.indices.includes(tip ?? -1)); if (pair) setFocusPair(pair.indices); }
      }}/>
        <div className="stage-legend"><span><i className="legend-recorded"/>My movement</span><span><i className="legend-reference"/>Reference</span></div>
        <div className="stage-bottom-labels"><span><MousePointer2 size={14}/>Drag to rotate · Pinch to zoom</span><button className="subtle-button" onClick={() => setReset(v => v + 1)}><Focus size={16}/>Reset view</button></div>
        {!frame?.tracking && <div className="tracking-gap-label"><ScanLine size={17}/>No tracked hand at this moment</div>}
        {help && <div className="stage-help"><button className="icon-button" aria-label="Close explanation" onClick={() => setHelp(false)}><X size={16}/></button><strong>Reading the replay</strong><p>Compare your recorded movement with the reference. Select a finger to focus on it, or turn on differences to see how the positions vary.</p></div>}
      </div>
      <div className="stage-layer-controls">{[{ label: 'My movement', active: recorded, toggle: () => setRecorded(v => !v) }, { label: 'Reference', active: ghost, toggle: () => setGhost(v => !v) }, { label: 'Show differences', active: vectors, toggle: () => setVectors(v => !v) }].map(layer => <button key={layer.label} className={`layer-toggle ${layer.active ? 'on' : ''}`} aria-pressed={layer.active} onClick={layer.toggle}><span className="toggle-check">{layer.active && <Check size={12}/>}</span>{layer.label}</button>)}</div>
    </section>
    <section className="timeline-panel"><div className="timeline-caption">{phase.name}</div><label className="echo-sr-only" htmlFor="studio-replay">Replay position</label><input id="studio-replay" className="studio-replay-range" type="range" min={0} max={session.duration} step={.01} value={time} aria-valuetext={phase.name} onChange={e => { setTime(Number(e.target.value)); setPlaying(false); }}/>
      <div className="playback-row"><div className="playback-controls"><button className="icon-button" aria-label="Restart replay" onClick={() => setTime(0)}><RotateCcw size={18}/></button><button className="icon-button" aria-label="Previous moment" disabled={!previous} onClick={() => jump(previous?.id)}><SkipBack size={18}/></button><button className="play-button" aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={() => { if (time >= session.duration) setTime(0); setPlaying(v => !v); }}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><button className="icon-button" aria-label="Next moment" disabled={!next} onClick={() => jump(next?.id)}><SkipForward size={18}/></button></div><div className="speed-controls">{[{ value: .5, label: 'Slow' }, { value: 1, label: 'Normal' }].map(option => <button key={option.value} className={speed === option.value ? 'selected' : ''} onClick={() => setSpeed(option.value)}>{option.label}</button>)}</div></div>
    </section>
    <section className="studio-finish">{gardenReward === session.id && <p role="status">A flower grew</p>}<button className="btn btn-primary" onClick={() => navigate('garden')}>Garden<ArrowRight size={18}/></button></section>
  </div>;
}
