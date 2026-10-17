import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Loader2, RotateCcw, Square, TriangleAlert } from 'lucide-react';
import { averageHands, clinicianTarget } from '../lib/geometry';
import { defaultExercise, exercises } from '../lib/exercises';
import { parseLessonReply } from '../lib/coachLesson';
import { useHandTracker } from '../lib/useHandTracker';
import { extractReferenceFromVideo } from '../lib/referenceVideo';
import type { Calibration, HandFrame, HandSide, MotionSession, Vec3 } from '../lib/types';

import { useClinicalCapture } from '../features/clinical-data/useClinicalCapture';
import './exercise.css';

const VoiceCoach = lazy(()=>import('./VoiceCoach'));
const PatientSyncPanel = lazy(()=>import('../features/clinician/PatientSyncPanel'));

type Step = 'neutral' | 'target' | 'ready' | 'countdown' | 'recording' | 'done';
type Capture = { kind: 'neutral' | 'target'; start: number; stableStart: number; lastObservedAt: number; points: Vec3[][]; anchor: Vec3[]; wrist: Vec3 | null; label: string | null };

function Guide({ hand }: { hand: HandSide }) {
  return <svg className="ex-placement-guide" style={{ transform: hand === 'Left' ? 'scaleX(-1)' : undefined }} viewBox="0 0 400 430" aria-hidden="true"><path d="M135 376 C124 345 104 317 90 295 L52 233 C41 211 57 193 74 205 L118 247 L110 112 C108 88 134 85 138 108 L151 214 L153 65 C152 40 178 40 181 64 L186 206 L198 53 C200 28 225 32 224 57 L223 211 L240 87 C243 64 266 68 263 91 L256 224 L277 150 C283 130 305 136 299 156 L282 270 C278 314 254 346 250 376" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="7 8"/><path d="M132 379H253" stroke="currentColor" strokeWidth="2" strokeDasharray="7 8"/></svg>;
}

export default function ExerciseFlow({ onComplete, onBack }: { onComplete: (session: MotionSession) => void; onBack: () => void }) {
  const tracker = useHandTracker();
  const clinicalCapture = useClinicalCapture();
  const clinicalCaptureRef = useRef(clinicalCapture); clinicalCaptureRef.current = clinicalCapture;
  const recordingId = useRef(crypto.randomUUID());
  const recordedAt = useRef(new Date().toISOString());
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
  const [exerciseId, setExerciseId] = useState(defaultExercise.id);
  const exercise = exercises.find(item => item.id === exerciseId) ?? defaultExercise;
  const [coachConnected, setCoachConnected] = useState(false);
  const connectedRef = useRef(false);
  const [showReferencePicker, setShowReferencePicker] = useState(false);
  const [referenceVideoBusy, setReferenceVideoBusy] = useState(false);
  const [referenceVideoProgress, setReferenceVideoProgress] = useState(0);

  const referenceInput = useRef<HTMLInputElement>(null);
  const referenceAbort = useRef<AbortController | null>(null);
  useEffect(() => () => referenceAbort.current?.abort(), []);
  const [cycleDuration, setCycleDuration] = useState(defaultExercise.defaultCycleDuration);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [session, setSession] = useState<MotionSession | null>(null);
  const [partial, setPartial] = useState(false);
  const recordingRef = useRef<HandFrame[]>([]);
  const recordStart = useRef(0);
  const finishRef = useRef<(duration: number) => void>(() => {});
  const totalDuration = cycleDuration * exercise.repetitions;
  const phase = exercise.phaseAt(Math.min(elapsed, totalDuration - .001), cycleDuration);
  const active = step === 'countdown' || step === 'recording';
  const detecting = Boolean(sample?.tracking && status === 'ready');

  const resetCalibration = () => {
    setStep('neutral'); setNeutral([]); setCalibration(null); setCapture(null); captureRef.current = null;
    setCaptureProgress(0); setHint(''); setConfirmed(false); setShowReferencePicker(false); setSession(null); setElapsed(0); lockIdentity(null);
  };

  const beginCapture = (kind: 'neutral' | 'target') => {
    if (!sample?.tracking || !confirmed || !connectedRef.current || captureRef.current) return;
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
      setNeutral(measured); lockIdentity(current.label); setStep('target'); setHint('');
    } else {
      if (!exercise.hasDistinctTarget(neutral, measured)) {
        setHint('We did not measure a clear change from neutral. Retry at a comfortable range, or use a clinician-provided target. Do not force the movement.'); return;
      }
      setCalibration({ neutral, target: measured, source: 'personal', hand, createdAt: new Date().toISOString() });
      setStep('ready'); setHint('');
    }
  }, [sample, neutral, hand, lockIdentity, exercise]);

  useEffect(() => {
    if (!capture) return;
    const timeout = window.setTimeout(() => {
      if (captureRef.current) { captureRef.current = null; setCapture(null); setCaptureProgress(0); setHint('Capture timed out. Reposition your hand and retry.'); }
    }, 12500);
    return () => clearTimeout(timeout);
  }, [capture]);

  const importReferenceVideo = async (file: File | undefined) => {
    if (!file || !neutral.length || !confirmed || referenceVideoBusy || !connectedRef.current) return;
    const controller = new AbortController(); referenceAbort.current = controller;
    setReferenceVideoBusy(true); setReferenceVideoProgress(0); setHint('Reading the local reference video. Nothing is uploaded.');
    try {
      const extracted = await extractReferenceFromVideo(file, setReferenceVideoProgress, controller.signal);
      if (controller.signal.aborted || !connectedRef.current) return;
      setNeutral(extracted.neutral);
      setCalibration({ neutral: extracted.neutral, target: extracted.target, source: 'exemplar', hand, createdAt: new Date().toISOString(), exemplarName: file.name, exemplarFrames: extracted.frames });
      setStep('ready'); setHint('');
    } catch (error) {
      if (controller.signal.aborted) return;
      setHint(error instanceof Error ? error.message : 'The reference video could not be analyzed. Try another clip.');
    } finally { setReferenceVideoBusy(false); }
  };

  const finishRecording = (duration: number) => {
    if (!calibration) return;
    const frames = recordingRef.current;
    const result: MotionSession = { id: recordingId.current, createdAt: recordedAt.current, hand, duration, cycleDuration, frames: [...frames], calibration, source: 'camera', exerciseId: exercise.id, completed: duration >= totalDuration - .2 };
    setSession(result); setElapsed(duration); setPartial(duration < totalDuration - .2); setStep('done'); clinicalCaptureRef.current.finish(result); stop();
  };
  finishRef.current = finishRecording;

  useEffect(() => {
    if (step !== 'countdown') return;
    const deadline = performance.now() + 3000;
    const id = window.setInterval(() => {
      const left = deadline - performance.now();
      setCountdown(Math.max(1, Math.ceil(left / 1000)));
      if (left <= 0) {
        clearInterval(id);
        recordingRef.current = []; recordStart.current = performance.now(); recordedAt.current = new Date().toISOString(); recordingId.current = crypto.randomUUID();
        try { clinicalCaptureRef.current.begin(tracker.videoRef.current, recordStart.current, recordedAt.current); }
        catch (error) { setHint(error instanceof Error ? error.message : 'Video recording could not start.'); setStep('ready'); return; }
        setElapsed(0); setStep('recording');
      }
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
  const stepNumber = step === 'done' ? 4 : active || step === 'ready' ? 3 : neutral.length ? 2 : 1;

  const stopLesson = () => {
    referenceAbort.current?.abort();
    captureRef.current = null; setCapture(null); setCaptureProgress(0);
    if (step === 'recording') finishRecording(Math.min(totalDuration, (performance.now() - recordStart.current) / 1000));
    else { if (step === 'countdown') setStep('ready'); stop(); }
  };

  const handleConnection = (connected: boolean) => {
    const wasConnected = connectedRef.current;
    connectedRef.current = connected; setCoachConnected(connected);
    if (connected && step !== 'done') void tracker.start();
    if (!connected && wasConnected) stopLesson();
  };

  const replyToCoach = (reply: string): string => {
    if (!connectedRef.current) return 'Start your lesson to talk with your coach.';
    const command = parseLessonReply(reply);
    if (!command) return 'Your coach can answer. To continue, say your hand, “ready”, or “begin”.';
    if (command.type === 'stop') { stopLesson(); setHint('Practice stopped. Rest your hand. Say retry camera when you want to continue.'); return 'Stopped. Rest your hand; you can review any captured movement.'; }
    if (command.type === 'review') {
      if (session && validCount >= 8) { onComplete(session); return 'Opening your movement.'; }
      return 'We need a recording with enough tracked frames before opening your movement.';
    }
    if (captureRef.current || referenceVideoBusy) return 'We are measuring your reference. Hold comfortably still, or say stop.';
    if (active) return 'Practice is underway. Follow the rhythm, or say stop at any time.';
    if (command.type === 'hand') {
      if (neutral.length) return 'Your hand is already calibrated. Say recalibrate to change hands.';
      setHand(command.hand); setConfirmed(true); setHint('');
      return `Your physical ${command.hand.toLowerCase()} hand is confirmed.`;
    }
    if (command.type === 'retry') {
      if (step === 'done') { setStep('ready'); setSession(null); setElapsed(0); }
      setHint(''); void tracker.start(); return 'Reconnecting your camera.';
    }
    if (command.type === 'recalibrate') { resetCalibration(); return 'Starting a fresh calibration. Which physical hand will you use?'; }
    if (command.type === 'pace') {
      setCycleDuration(command.seconds); return `Each repetition will take ${command.seconds} seconds.`;
    }
    if (command.type === 'reference') {
      if (step !== 'target') return 'First confirm your hand and capture your neutral position.';
      setShowReferencePicker(true); return 'Choose your reference clip in the coach panel.';
    }
    if (command.type === 'angles') {
      if (step !== 'target') return 'First capture your neutral position.';
      const target = clinicianTarget(neutral, command.values);
      if (target.length !== 21) return 'Those angles are outside the supported range. Please check your clinician’s prescription.';
      setCalibration({ neutral, target, source: 'clinician', hand, createdAt: new Date().toISOString() });
      setStep('ready'); setHint(''); return 'Your prescribed target is set.';
    }
    if (!confirmed) return 'Tell your coach “left hand” or “right hand” to confirm your physical hand.';
    if (!detecting) { setHint('Keep your whole hand in the camera guide, then say ready.'); return 'We cannot see your whole hand yet. Reposition, then say ready.'; }
    if (step === 'neutral' || step === 'target') { beginCapture(step); return 'Hold comfortably still while we measure.'; }
    if (step === 'ready') { setCountdown(3); setHint(''); setStep('countdown'); return 'Beginning after a three-second countdown.'; }
    return 'Say see my movement to review, or retry camera to record again.';
  };

  const cue = hint || (step === 'done'
    ? `${partial ? 'Your practice stopped early.' : 'Your practice is complete.'} Say “see my movement” to explore the captured portion, or “retry camera” to record again.`
    : !confirmed ? 'Which physical hand are you exercising? Say “left hand” or “right hand”.'
    : status === 'error' ? 'Your camera needs reconnecting. Say “retry camera”, or use the retry button.'
    : status !== 'ready' ? 'Allow camera access and wait for the hand guide.'
    : capture ? 'Hold comfortably still while we capture this position.'
    : step === 'neutral' ? exercise.neutralCue
    : step === 'target' ? exercise.targetCue
    : step === 'ready' ? `Your ${calibration?.source === 'exemplar' ? 'video example' : calibration?.source === 'clinician' ? 'prescribed' : 'personal'} reference is ready. ${exercise.practiceCue} Each repetition takes ${cycleDuration} seconds. You can ask for 6, 8, or 10 seconds.`
    : step === 'countdown' ? 'Practice begins in three seconds. Stop whenever you need to.'
    : `Repetition ${Math.min(exercise.repetitions, phase.repetition)} of ${exercise.repetitions}. ${exercise.phaseCue(phase.name) + '.'}`);

  return <div className={`ex-page ex-step-${step} ex-camera-${status}`}>
    <div className="ex-heading"><div><button className="ex-back" onClick={() => { if (step === 'recording') finishRef.current(Math.min(totalDuration, (performance.now() - recordStart.current) / 1000)); stop(); onBack(); }}><ArrowLeft size={15}/> Home</button><h1 className="ex-exercise-label"><label htmlFor="exercise-choice">Exercise</label></h1><select id="exercise-choice" className="ex-exercise-choice" value={exerciseId} disabled={coachConnected || active || Boolean(capture) || referenceVideoBusy} onChange={event => { setExerciseId(event.target.value); resetCalibration(); setCycleDuration(exercises.find(item => item.id === event.target.value)?.defaultCycleDuration ?? 8); }} >{exercises.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div>
    <div className="ex-steps" aria-label="Exercise progress">{['Coach', 'Target', 'Practice', 'Replay'].map((label, i) => <div className={stepNumber === i + 1 ? 'ex-step ex-current' : stepNumber > i + 1 ? 'ex-step ex-complete' : 'ex-step'} key={label}><span>{stepNumber > i + 1 ? <Check size={14}/> : `0${i + 1}`}</span>{label}</div>)}</div>
    <div className="ex-layout">
      <aside className="ex-sidebar"><Suspense fallback={<p>Loading coach…</p>}><VoiceCoach cue={cue} context={`Exercise: ${exercise.name}. Step: ${step}. Physical hand: ${confirmed ? hand : 'not confirmed'}. Camera: ${status}. Reference: ${calibration?.source ?? 'not captured'}. Repetitions: ${exercise.repetitions}. Cycle: ${cycleDuration} seconds. ${hint}`} onReply={replyToCoach} onConnection={handleConnection}/></Suspense>
        {capture && <div className="ex-capture-progress" role="progressbar" aria-label="Stable calibration capture" aria-valuenow={Math.round(captureProgress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${captureProgress * 100}%` }}/></div>}
        {showReferencePicker && step === 'target' && coachConnected && <div className="ex-coach-attachment"><label htmlFor="reference-video">Choose your reference video</label><input ref={referenceInput} id="reference-video" type="file" accept="video/*" disabled={referenceVideoBusy || Boolean(capture)} onChange={event => { void importReferenceVideo(event.target.files?.[0]); event.currentTarget.value = ''; }}/>{referenceVideoBusy && <p role="status">Reading video… {Math.round(referenceVideoProgress * 100)}%</p>}</div>}
        <Suspense fallback={null}><PatientSyncPanel consent={clinicalCapture.consent} onConsent={clinicalCapture.setConsent} disabled={active || Boolean(capture) || referenceVideoBusy} notice={clinicalCapture.notice} version={clinicalCapture.version}/></Suspense>
      </aside>
      <section className="ex-camera-panel" aria-label="Camera and live tracking">
        <div className="ex-camera-top"><span><Camera size={15}/> {step === 'done' ? 'Capture complete' : 'Camera'}</span><span className={step === 'recording' ? 'ex-rec' : 'ex-feed-note'}>{step === 'recording' ? <><i/> REC · {elapsed.toFixed(1)}s</> : 'MIRRORED'}</span></div>
        <div className="ex-video-wrap">
          <video ref={tracker.videoRef} className="ex-video" muted playsInline aria-label="Live mirrored webcam preview"/>
          <canvas ref={tracker.canvasRef} className="ex-overlay" aria-hidden="true"/>
          {step !== 'done' && <div className="ex-guide-container"><Guide hand={hand}/></div>}
          {status === 'off' && step !== 'done' && <div className="ex-camera-cover"><div className="ex-camera-icon"><Camera size={29}/></div><h2>{coachConnected ? 'Camera paused' : 'Camera off'}</h2>{coachConnected&&<p>Say “retry camera” to reconnect.</p>}{coachConnected && <button className="ex-secondary" onClick={() => { setHint(''); void tracker.start(); }}>Reconnect camera</button>}</div>}
          {status === 'loading' && <div className="ex-camera-cover"><Loader2 size={34} className="ex-spin"/><h2>Starting camera…</h2><p>Allow camera access when your browser asks.</p></div>}
          {status === 'error' && <div className="ex-camera-cover"><TriangleAlert size={31}/><h2>Camera disconnected</h2><p>{tracker.error}</p><button className="ex-primary" disabled={!coachConnected} onClick={() => void tracker.start()}>Retry camera <RotateCcw size={15}/></button></div>}
          {step === 'countdown' && <div className="ex-countdown" role="status"><span>{countdown}</span><p>Starting…</p></div>}
          {step === 'recording' && <div className="ex-live-cue"><span>REPETITION {Math.min(exercise.repetitions, phase.repetition)} OF {exercise.repetitions}</span><h2>{exercise.phaseCue(phase.name)}</h2></div>}
          {step === 'done' && <div className="ex-camera-cover ex-completed"><CheckCircle2 size={44}/><h2>Recording complete</h2><p>{elapsed.toFixed(1)} seconds · {validCount} tracked frames<br/>{partial ? 'Your practice ended early.' : ''}</p>{validCount >= 8 ? <button className="ex-primary" onClick={() => session && onComplete(session)}>View replay <ArrowRight size={18}/></button> : <p className="ex-error-text">Not enough tracking. Say “retry camera”.</p>}</div>}
        </div>
        {status === 'ready' && <div className="ex-camera-bottom"><span className={detecting ? 'ex-tracking ex-tracking-good' : 'ex-tracking'}><i/>{detecting ? 'Hand in view' : sample?.reason ?? 'Position your hand inside the guide.'}</span></div>}
        {active && <div className="ex-recording-controls"><div className="ex-session-progress"><span style={{ width: `${elapsed / totalDuration * 100}%` }}/></div><div><span>{elapsed.toFixed(0)}s <small>/ {totalDuration}s</small></span><button className="ex-stop" onClick={() => { stopLesson(); setHint('Practice stopped. Rest your hand.'); }}><Square size={13} fill="currentColor"/> Stop practice</button></div></div>}
      </section>
    </div>
  </div>;
}
