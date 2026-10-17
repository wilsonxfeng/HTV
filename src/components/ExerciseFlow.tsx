import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Circle, Hand, Loader2, LockKeyhole, RotateCcw, ShieldCheck, Square, Timer, TriangleAlert } from 'lucide-react';
import { averageHands, clinicianTarget, getPhase, pairAngles, referenceAt } from '../lib/geometry';
import { useHandTracker } from '../lib/useHandTracker';
import type { Calibration, HandFrame, HandSide, MotionSession, Vec3 } from '../lib/types';
import HandStage from './HandStage';
import './exercise.css';

type Step = 'neutral' | 'target' | 'ready' | 'countdown' | 'recording' | 'done';
type Capture = { kind: 'neutral' | 'target'; start: number; stableStart: number; lastObservedAt: number; points: Vec3[][]; anchor: Vec3[]; wrist: Vec3 | null; label: string | null };
const instructions = { Together: 'Begin with fingers gently together.', Spread: 'Spread your fingers comfortably.', Hold: 'Hold this position.', Close: 'Bring your fingers together.' };

function Guide({ hand }: { hand: HandSide }) {
  return <svg className="ex-placement-guide" style={{ transform: hand === 'Left' ? 'scaleX(-1)' : undefined }} viewBox="0 0 400 430" aria-hidden="true"><path d="M135 376 C124 345 104 317 90 295 L52 233 C41 211 57 193 74 205 L118 247 L110 112 C108 88 134 85 138 108 L151 214 L153 65 C152 40 178 40 181 64 L186 206 L198 53 C200 28 225 32 224 57 L223 211 L240 87 C243 64 266 68 263 91 L256 224 L277 150 C283 130 305 136 299 156 L282 270 C278 314 254 346 250 376" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="7 8"/><path d="M132 379H253" stroke="currentColor" strokeWidth="2" strokeDasharray="7 8"/></svg>;
}

export default function ExerciseFlow({ onComplete, onBack }: { onComplete: (session: MotionSession) => void; onBack: () => void }) {
  const tracker = useHandTracker();
  const { sample, latestRef, status, stop, lockIdentity } = tracker;
  const [step, setStep] = useState<Step>('neutral');
  const [hand, setHand] = useState<HandSide>('Right');
  const [confirmed, setConfirmed] = useState(false);
  const [neutral, setNeutral] = useState<Vec3[]>([]);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [capture, setCapture] = useState<'neutral' | 'target' | null>(null);
  const captureRef = useRef<Capture | null>(null);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [hint, setHint] = useState('');
  const [showClinician, setShowClinician] = useState(false);
  const [gaps, setGaps] = useState(['', '', '']);
  const [cycleDuration, setCycleDuration] = useState(8);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [session, setSession] = useState<MotionSession | null>(null);
  const [partial, setPartial] = useState(false);
  const recordingRef = useRef<HandFrame[]>([]);
  const recordStart = useRef(0);
  const finishRef = useRef<(duration: number) => void>(() => {});
  const [previewTime, setPreviewTime] = useState(0);
  const totalDuration = cycleDuration * 3;
  const phase = getPhase(step === 'recording' || step === 'done' ? Math.min(elapsed, totalDuration - .001) : previewTime, cycleDuration);
  const active = step === 'countdown' || step === 'recording';
  const detecting = Boolean(sample?.tracking && status === 'ready');

  useEffect(() => {
    if (step === 'recording' || step === 'done') return;
    const started = performance.now();
    const id = window.setInterval(() => setPreviewTime((performance.now() - started) / 1000), 80);
    return () => clearInterval(id);
  }, [step]);

  const resetCalibration = () => {
    setStep('neutral'); setNeutral([]); setCalibration(null); setCapture(null); captureRef.current = null;
    setCaptureProgress(0); setHint(''); setConfirmed(false); lockIdentity(null);
  };

  const beginCapture = (kind: 'neutral' | 'target') => {
    if (!sample?.tracking || !confirmed) return;
    const now = performance.now();
    captureRef.current = { kind, start: now, stableStart: now, lastObservedAt: sample.observedAt, points: [], anchor: sample.landmarks, wrist: sample.imageLandmarks?.[0] ?? null, label: sample.modelHandedness ?? null };
    setCapture(kind); setCaptureProgress(0); setHint('Hold comfortably still while we measure your hand.');
  };

  useEffect(() => {
    const current = captureRef.current;
    if (!current || !sample) return;
    const now = performance.now();
    if (now - current.start > 12000) {
      captureRef.current = null; setCapture(null); setCaptureProgress(0);
      setHint('We could not capture a stable position. Rest your arm, improve the lighting, and try again. A clinician can provide a target after a neutral capture.'); return;
    }
    const interrupted = sample.observedAt - current.lastObservedAt > 200 || document.hidden;
    current.lastObservedAt = sample.observedAt;
    const wrist = sample.imageLandmarks?.[0];
    const poseMotion = sample.tracking ? Math.sqrt(sample.landmarks.reduce((sum, p, i) => sum + (p.x - current.anchor[i].x) ** 2 + (p.y - current.anchor[i].y) ** 2 + (p.z - current.anchor[i].z) ** 2, 0) / 21) : Infinity;
    const wristMotion = wrist && current.wrist ? Math.hypot(wrist.x - current.wrist.x, wrist.y - current.wrist.y) : Infinity;
    if (interrupted || !sample.tracking || poseMotion > .07 || wristMotion > .055 || (sample.modelHandedness ?? null) !== current.label) {
      current.stableStart = now; current.points = [];
      if (sample.tracking) { current.anchor = sample.landmarks; current.wrist = wrist ?? null; current.label = sample.modelHandedness ?? null; }
      setCaptureProgress(0); setHint(sample.tracking ? 'Keep your fingers and palm comfortably still.' : sample.reason); return;
    }
    current.points.push(sample.landmarks);
    const progress = Math.min(1, (now - current.stableStart) / 1200);
    setCaptureProgress(progress);
    if (progress < 1 || current.points.length < 8) return;
    const measured = averageHands(current.points);
    captureRef.current = null; setCapture(null); setCaptureProgress(0);
    if (measured.length !== 21) { setHint('The measurement was incomplete. Please try again.'); return; }
    if (current.kind === 'neutral') {
      setNeutral(measured); lockIdentity(current.label); setStep('target'); setHint('Neutral captured. Now slowly spread to a comfortable range.');
    } else {
      const neutralAngles = pairAngles(neutral); const targetAngles = pairAngles(measured);
      if (!targetAngles.slice(1).some((angle, i) => angle - neutralAngles[i + 1] >= 2)) {
        setHint('We did not measure a clear change from neutral. Retry at a comfortable range, or use a clinician-provided target. Do not force the movement.'); return;
      }
      setCalibration({ neutral, target: measured, source: 'personal', hand, createdAt: new Date().toISOString() });
      setStep('ready'); setHint('Your personal reference is ready. Follow the guide for three comfortable repetitions.');
    }
  }, [sample, neutral, hand, lockIdentity]);

  useEffect(() => {
    if (!capture) return;
    const timeout = window.setTimeout(() => {
      if (captureRef.current) { captureRef.current = null; setCapture(null); setCaptureProgress(0); setHint('Capture timed out. Reposition your hand and retry.'); }
    }, 12500);
    return () => clearTimeout(timeout);
  }, [capture]);

  const applyClinicianTarget = () => {
    const values = gaps.map(value => Number(value)) as [number, number, number];
    if (gaps.some(value => !value.trim())) { setHint('Enter all three target angles from your clinician.'); return; }
    const target = clinicianTarget(neutral, values);
    if (target.length !== 21) { setHint('Enter angles from 0° to 60°, with the last two totaling no more than 100°.'); return; }
    setCalibration({ neutral, target, source: 'clinician', hand, createdAt: new Date().toISOString() });
    setStep('ready'); setHint('Clinician-provided target applied to your measured neutral hand.'); setShowClinician(false);
  };

  const finishRecording = (duration: number) => {
    if (!calibration) return;
    const frames = recordingRef.current;
    const result: MotionSession = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), hand, duration, cycleDuration, frames: [...frames], calibration, source: 'camera' };
    setSession(result); setElapsed(duration); setPartial(duration < totalDuration - .2); setStep('done'); stop();
  };
  finishRef.current = finishRecording;

  useEffect(() => {
    if (step !== 'countdown') return;
    const deadline = performance.now() + 3000;
    const id = window.setInterval(() => {
      const left = deadline - performance.now();
      setCountdown(Math.max(1, Math.ceil(left / 1000)));
      if (left <= 0) { recordingRef.current = []; recordStart.current = performance.now(); setElapsed(0); setStep('recording'); }
    }, 100);
    return () => clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (step !== 'recording') return;
    let lastObservedAt = recordStart.current;
    const recordFrame = (t: number) => {
      const latest = latestRef.current;
      const fresh = latest && latest.observedAt > lastObservedAt && latest.observedAt >= recordStart.current && performance.now() - latest.observedAt <= 200;
      if (fresh) {
        lastObservedAt = latest.observedAt;
        const observedT = Math.min(t, Math.max(0, (latest.observedAt - recordStart.current) / 1000));
        const tracked = latest.tracking && !document.hidden;
        if (!recordingRef.current.length || observedT > recordingRef.current[recordingRef.current.length - 1].t) recordingRef.current.push({ t: observedT, tracking: tracked, landmarks: tracked ? latest.landmarks.map(p => ({ ...p })) : [], worldLandmarks: tracked ? latest.worldLandmarks?.map(p => ({ ...p })) : undefined, imageLandmarks: tracked ? latest.imageLandmarks?.map(p => ({ ...p })) : undefined, confidence: tracked ? latest.confidence : 0, modelHandedness: latest.modelHandedness });
      } else if (!latest || !latest.tracking || performance.now() - latest.observedAt > 200 || document.hidden || !recordingRef.current.length) {
        recordingRef.current.push({t, tracking:false, landmarks:[], confidence:0});
      }
      setElapsed(t);
    };
    recordFrame(0);
    const id = window.setInterval(() => {
      const t = Math.min(totalDuration, (performance.now() - recordStart.current) / 1000);
      recordFrame(t);
      if (t >= totalDuration) finishRef.current(t);
    }, 66);
    return () => clearInterval(id);
  }, [step, latestRef, totalDuration]);

  // A camera error ends the current recording with its real partial data.
  useEffect(() => {
    if (status === 'error' && captureRef.current) { captureRef.current = null; setCapture(null); setCaptureProgress(0); setHint('Camera disconnected during calibration. Retry the camera, then capture again.'); }
    if (status === 'error' && step === 'recording') finishRef.current(Math.min(totalDuration, (performance.now() - recordStart.current) / 1000));
    if (status === 'error' && step === 'countdown') { setStep('ready'); setHint('Reconnect the camera before recording.'); }
  }, [status, step, totalDuration]);

  const validCount = session?.frames.filter(frame => frame.tracking).length ?? 0;
  const previewReference = calibration ? referenceAt(calibration, step === 'recording' || step === 'done' ? elapsed : previewTime, cycleDuration) : undefined;
  const stepNumber = active || step === 'done' || step === 'ready' ? 3 : neutral.length ? 2 : 1;

  return <main className="ex-page">
    <div className="ex-heading"><div><button className="ex-back" onClick={() => { stop(); onBack(); }}><ArrowLeft size={15} /> Back to overview</button><div className="ex-eyebrow">GUIDED HAND MOBILITY</div><h1>Finger Spread <span>& Close</span></h1><p>A little space between your fingers. A clearer picture of your movement.</p></div><div className="ex-private"><ShieldCheck size={17}/><span>Processed on your device<small>No video is saved or uploaded</small></span></div></div>
    <div className="ex-steps" aria-label="Exercise progress">{['Position your hand', 'Create your reference', 'Move at your pace'].map((label, i) => <div className={stepNumber === i + 1 ? 'ex-step ex-current' : stepNumber > i + 1 ? 'ex-step ex-complete' : 'ex-step'} key={label}><span>{stepNumber > i + 1 ? <Check size={14} /> : `0${i + 1}`}</span>{label}</div>)}</div>
    <div className="ex-layout"><section className="ex-camera-panel" aria-label="Camera and live tracking">
      <div className="ex-camera-top"><span><Camera size={15}/> {step === 'done' ? 'Capture complete' : 'Live camera'}</span><span className={step === 'recording' ? 'ex-rec' : 'ex-feed-note'}>{step === 'recording' ? <><i/> REC · {elapsed.toFixed(1)}s</> : 'SELFIE VIEW'}</span></div>
      <div className="ex-video-wrap">
        <video ref={tracker.videoRef} className="ex-video" muted playsInline aria-label="Live mirrored webcam preview"/>
        <canvas ref={tracker.canvasRef} className="ex-overlay" aria-hidden="true"/>
        {step !== 'done' && <div className="ex-guide-container"><Guide hand={hand}/></div>}
        {status === 'off' && step !== 'done' && <div className="ex-camera-cover"><div className="ex-camera-icon"><Camera size={29}/></div><h2>Let’s see your movement.</h2><p>Enable your camera to position your hand<br/>and create a personal reference.</p><button className="ex-primary" onClick={() => void tracker.start()}><Camera size={16}/> Enable camera</button><small><LockKeyhole size={12}/> Your camera stays private.</small></div>}
        {status === 'loading' && <div className="ex-camera-cover"><Loader2 size={34} className="ex-spin"/><h2>Preparing hand tracking</h2><p>Allow camera access when your browser asks.<br/>Loading the local vision model…</p></div>}
        {status === 'error' && <div className="ex-camera-cover"><TriangleAlert size={31}/><h2>Let’s reconnect your camera.</h2><p>{tracker.error}</p><button className="ex-primary" onClick={() => void tracker.start()}>Retry camera <RotateCcw size={15}/></button><button className="ex-text-button" onClick={onBack}>Return to overview</button></div>}
        {step === 'countdown' && <div className="ex-countdown" role="status"><span>{countdown}</span><p>Get comfortable. We’ll begin together.</p></div>}
        {step === 'recording' && <div className="ex-live-cue"><span>REPETITION {Math.min(3, phase.repetition)} OF 3</span><h2>{phase.name === 'Together' ? 'Fingers together' : phase.name === 'Spread' ? 'Gently spread' : phase.name === 'Hold' ? 'Hold comfortably' : 'Slowly close'}</h2></div>}
        {step === 'done' && <div className="ex-camera-cover ex-completed"><div className="ex-success-icon"><CheckCircle2 size={44}/></div><span className="ex-eyebrow">{partial ? 'PARTIAL SESSION CAPTURED' : 'THREE REPETITIONS. ONE NEW PERSPECTIVE.'}</span><h2>Your movement,<br/><em>ready to explore.</em></h2><p>{elapsed.toFixed(1)} seconds · {validCount} tracked frames<br/>{partial ? 'Your recording ended early. You can explore the captured portion.' : 'Meet your movement in three dimensions.'}</p>{validCount >= 8 ? <button className="ex-primary ex-analyze" onClick={() => session && onComplete(session)}>ANALYZE MY MOVEMENT <ArrowRight size={18}/></button> : <p className="ex-error-text">There are not enough tracked frames to analyze. Try recording again with your whole hand in view.</p>}<button className="ex-text-button" onClick={() => { setStep('ready'); setSession(null); setElapsed(0); void tracker.start(); }}><RotateCcw size={14}/> Record again</button></div>}
        <div className="ex-corner ex-corner-tl"/><div className="ex-corner ex-corner-tr"/><div className="ex-corner ex-corner-bl"/><div className="ex-corner ex-corner-br"/>
      </div>
      <div className="ex-camera-bottom"><span className={detecting ? 'ex-tracking ex-tracking-good' : 'ex-tracking'}><i/>{step === 'done' ? 'Camera stopped · video not saved' : status === 'ready' ? sample?.reason ?? 'Position your hand inside the guide.' : 'Camera is private and local'}</span><span className="ex-telemetry">{detecting ? `21 POINTS · ${tracker.fps} FPS` : '21-POINT HAND TRACKING'}</span></div>
      {step === 'recording' && <div className="ex-recording-controls"><div className="ex-session-progress"><span style={{ width: `${elapsed / totalDuration * 100}%` }}/></div><div><span>{elapsed.toFixed(0)}s <small>/ {totalDuration}s</small></span><button className="ex-stop" onClick={() => finishRecording(Math.min(totalDuration, (performance.now() - recordStart.current) / 1000))}><Square size={13} fill="currentColor"/> Stop recording</button></div></div>}
    </section>
    <aside className="ex-sidebar">
      <section className="ex-instruction-card"><div className="ex-card-kicker"><span className="ex-small-icon"><Hand size={17}/></span><span>{active ? 'FOLLOW THE MOVEMENT' : 'YOUR PERSONAL REFERENCE'}</span></div>
        <div className="ex-hand-preview"><HandStage reference={previewReference} showRecorded={false} showReference={true} preview animate={!calibration} hand={hand}/><div className="ex-preview-label">{calibration ? calibration.source === 'personal' ? 'YOUR CALIBRATED TARGET' : 'CLINICIAN-PROVIDED TARGET' : 'EXERCISE DEMONSTRATION'}</div></div>
        <div className="ex-instruction-copy" aria-live="polite"><h2>{active ? phase.name : step === 'target' ? 'Find your comfortable range.' : step === 'ready' ? 'Ready when you are.' : step === 'done' ? 'A new view of your movement.' : 'Palm forward. Fingers relaxed.'}</h2><p>{active ? instructions[phase.name] : step === 'target' ? 'Slowly spread your fingers to a comfortable or prescribed range. Keep your palm facing the camera.' : step === 'ready' ? 'Follow three slow cycles: together, spread, hold, and close. Stay within your comfortable range.' : step === 'done' ? 'Explore your captured movement next to your individualized reference in the 3D studio.' : 'Sit comfortably and support your arm. Hold one hand in the guide with your fingers relatively straight and gently together.'}</p></div>
      </section>
      {!active && step !== 'done' && <section className="ex-settings-card">
        <label className="ex-field-label">Which hand are you exercising?</label><div className="ex-segmented">{(['Left','Right'] as HandSide[]).map(side => <button key={side} className={hand === side ? 'ex-selected' : ''} aria-pressed={hand === side} disabled={neutral.length > 0 || Boolean(capture)} onClick={() => { setHand(side); setConfirmed(false); }}>{side} hand {hand === side && <Check size={13}/>}</button>)}</div>
        {step === 'neutral' && <label className="ex-confirm"><input type="checkbox" disabled={Boolean(capture)} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>I am showing my <strong>{hand.toLowerCase()} hand</strong> only.<small>The preview is mirrored. Confirm your physical hand.</small></span></label>}
        <div className="ex-calibration-status"><span>{neutral.length ? <CheckCircle2 size={16}/> : <Circle size={16}/>} Neutral position</span><span>{calibration ? <CheckCircle2 size={16}/> : <Circle size={16}/>} Reference target</span></div>
        {(step === 'neutral' || step === 'target') && <button className="ex-primary ex-full" disabled={!detecting || !confirmed || Boolean(capture)} onClick={() => beginCapture(step)}>{capture ? <><Loader2 size={16} className="ex-spin"/> Hold steady… {Math.round(captureProgress * 100)}%</> : <><Camera size={16}/> Capture {step === 'neutral' ? 'neutral position' : 'comfortable target'}</>}</button>}
        {capture && <div className="ex-capture-progress" role="progressbar" aria-label="Stable calibration capture" aria-valuenow={Math.round(captureProgress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${captureProgress * 100}%` }}/></div>}
        {hint && <p className="ex-hint" role="status">{hint}</p>}
        {step === 'target' && <><button className="ex-text-button ex-clinician-toggle" onClick={() => setShowClinician(!showClinician)} aria-expanded={showClinician}>Use clinician-provided target angles</button>{showClinician && <div className="ex-clinician"><p>If you cannot voluntarily spread your fingers, a clinician-provided reference is needed for personalized comparison. Enter the prescribed angle between each pair of finger axes.</p>{['Index–middle','Middle–ring','Ring–pinky'].map((label, i) => <label key={label}>{label}<span><input aria-label={`${label} target degrees`} type="number" min="0" max="60" step="1" value={gaps[i]} placeholder="—" onChange={event => setGaps(previous => previous.map((value, j) => j === i ? event.target.value : value))}/>°</span></label>)}<button className="ex-secondary ex-full" onClick={applyClinicianTarget}>Apply prescribed target</button><small>Targets use your measured neutral hand. No neutral measurements are invented.</small></div>}</>}
        {step === 'ready' && <><label className="ex-field-label ex-duration-label" htmlFor="ex-duration"><Timer size={14}/> Pace per repetition</label><select id="ex-duration" value={cycleDuration} onChange={event => setCycleDuration(Number(event.target.value))}><option value={6}>6 seconds · 18 seconds total</option><option value={8}>8 seconds · 24 seconds total</option><option value={10}>10 seconds · 30 seconds total</option></select><button className="ex-primary ex-full ex-start" disabled={!detecting || status !== 'ready'} onClick={() => { setCountdown(3); setStep('countdown'); }}>Start 3 repetitions <ArrowRight size={16}/></button></>}
        {neutral.length > 0 && !capture && <button className="ex-text-button ex-recalibrate" onClick={resetCalibration}><RotateCcw size={13}/> Recalibrate</button>}
      </section>}
      {active && <section className="ex-active-card"><span className="ex-eyebrow">YOUR SESSION</span><div className="ex-reps">{[1,2,3].map(rep => <span className={phase.repetition >= rep ? 'ex-rep-current' : ''} key={rep}>{phase.repetition > rep ? <Check size={18}/> : `0${rep}`}</span>)}</div><p>{step === 'countdown' ? 'Your recording starts after the countdown.' : !detecting ? 'Tracking lost — reposition your hand. Gaps are marked in your recording.' : 'Keep your palm facing the camera and move at a comfortable pace.'}</p>{step === 'countdown' && <button className="ex-secondary ex-full" onClick={() => setStep('ready')}>Cancel countdown</button>}</section>}
      <div className="ex-comfort-note"><ShieldCheck size={17}/><p>Comfort comes first. Pause if you feel pain.<br/>This demo visualizes movement; it is not a clinical assessment.</p></div>
    </aside></div>
  </main>;
}
