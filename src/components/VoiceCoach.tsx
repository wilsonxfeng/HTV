import { useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversationControls, useConversationInput, useConversationMode, useConversationStatus } from '@elevenlabs/react';
import { Headphones, Mic, MicOff, PhoneOff, Send } from 'lucide-react';
import { VOICE_AGENT_ID } from '../lib/voice';

type Props = {
  demoMode?: boolean;
  context: string;
  cue: string;
  commands?: string;
  onReply: (reply: string) => string;
  onConnection: (connected: boolean) => void;
};

export default function VoiceCoach(props: Props) {
  const [feedback, setFeedback] = useState('');
  const latest = useRef(props); latest.current = props;
  return <ConversationProvider onMessage={message => {
    if (message.source !== 'ai') setFeedback(latest.current.onReply(message.message));
  }}><CoachControls {...props} feedback={feedback} onFeedback={setFeedback}/></ConversationProvider>;
}

function CoachControls({ demoMode = false, context, cue, commands = 'left hand, right hand, ready, begin, stop, retry camera, reference video, recalibrate, see my movement, and 6/8/10 seconds', onReply, onConnection, feedback, onFeedback }: Props & { feedback: string; onFeedback: (text: string) => void }) {
  const { startSession, endSession, sendContextualUpdate, sendUserMessage } = useConversationControls();
  const { status, message } = useConversationStatus();
  const { isMuted, setMuted } = useConversationInput();
  const { isSpeaking } = useConversationMode();
  const [localError, setLocalError] = useState('');
  const [reply, setReply] = useState('');
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const connectionHandler = useRef(onConnection); connectionHandler.current = onConnection;
  const lastCue = useRef('');
  useEffect(() => {
    connectionHandler.current(connected);
    if (!connected) lastCue.current = '';
  }, [connected]);
  useEffect(() => {
    if (connected && !demoMode) sendContextualUpdate(`ReMotion app state: ${context}. The app validates captures and controls timing. You cannot see camera frames. Never claim a capture succeeded until the app reports it. Never diagnose or prescribe. User replies understood by the app: ${commands}. Ask for those clear replies. Do not invent exercises or repetitions.`);
  }, [connected, context, commands, demoMode, sendContextualUpdate]);
  useEffect(() => {
    if (connected && feedback && !demoMode) sendContextualUpdate(`App result for the user's reply: ${feedback}. Treat this as authoritative; do not claim a blocked action succeeded.`);
  }, [connected, feedback, demoMode, sendContextualUpdate]);
  useEffect(() => {
    if (!connected || !cue || (demoMode && cue === "Whenever you're ready, say begin") || lastCue.current === cue) return;
    lastCue.current = cue;
    sendUserMessage(`[App lesson cue, not a patient message] You are ReMotion's voice lesson coach. Deliver this instruction briefly and warmly, then wait for the user's reply. Do not announce repetition numbers or count repetitions aloud. Do not announce actions yourself: ${cue}`);
  }, [connected, cue, demoMode, sendUserMessage]);
  const start = () => {
    setLocalError(''); onFeedback('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setLocalError('Your coach needs microphone access on localhost or HTTPS.'); return;
    }
    startSession({ agentId: VOICE_AGENT_ID, connectionType: 'webrtc', ...(demoMode ? { overrides: { agent: { firstMessage: "Whenever you're ready, say begin", prompt: { prompt: "You are a minimal finger-exercise demo voice. Your first message must be exactly: Whenever you're ready, say begin. After that, stay silent unless an app lesson cue explicitly asks you to speak; speak only the exact instruction after the final colon. When the user says begin, do not add any acknowledgment or instruction. Never ask for hand selection, calibration, ready, or a reference. Never count repetitions or invent movement observations. Do not ask follow-up questions. If the user asks to stop, briefly acknowledge stopping." } } } } : {}) });
  };
  return <section className={`voice-coach ${connected ? '' : 'voice-coach-redesign is-idle'}`} aria-label="Voice lesson coach">
    {connected ? <>
      <div className="voice-heading"><span className="icon-tile voice-live"><Headphones size={24}/></span><div><h2>Voice coach</h2><p role="status">{isSpeaking ? 'Speaking' : isMuted ? 'Microphone muted' : 'Listening'}</p></div></div>
      <div className="voice-lesson-cue" aria-live="polite">{cue}</div>
    </> : <>
      <div className="voice-heading"><span className="voice-heading-icon"><Headphones size={22}/></span><div><h2>Voice coach</h2><p>Your movement companion</p></div><span className="voice-status" role="status"><i/>{connecting ? 'Connecting…' : 'Ready'}</span></div>
      <div className="voice-center">
        <div className="voice-orbit" aria-hidden="true"><div className="voice-orbit-core"><span/><span/><span/><span/><span/></div></div>
        <div className="voice-welcome"><h3>A little guidance,<br/>every step of the way.</h3><p>{connecting ? 'Connecting to your voice coach…' : 'Listen to your coach and move at your own pace.'}</p></div>
      </div>
    </>}
    <div className={connected ? "voice-connected-content" : "voice-action-area"}>
    {!connected && !connecting && <><button className="btn btn-primary full" onClick={start}><Mic size={19}/>Start lesson</button><p className="voice-consent">Uses camera &amp; mic · Voice powered by ElevenLabs</p></>}
    {(connected || connecting) && <div className="voice-controls"><button className="btn btn-secondary" onClick={() => { connectionHandler.current(false); void endSession(); }}><PhoneOff size={17}/>{connecting ? 'Cancel' : 'End lesson'}</button>{connected && <button className="btn btn-secondary" onClick={() => setMuted(!isMuted)} aria-pressed={isMuted}>{isMuted ? <MicOff size={17}/> : <Mic size={17}/>} {isMuted ? 'Unmute' : 'Mute'}</button>}</div>}
    {(status === 'error' || localError) && <p className="voice-error" role="alert">{localError || (/permission|denied|NotAllowed/i.test(message ?? '') ? 'Allow microphone access in your browser, then start the lesson again.' : 'Your coach could not connect. Start the lesson again to retry.')}</p>}
    {connected && <><form className="voice-reply" onSubmit={event => { event.preventDefault(); if (!reply.trim()) return; const text = reply.trim(); onFeedback(onReply(text)); sendUserMessage(text); setReply(''); }}><label htmlFor="coach-reply">Type a reply</label><div><input id="coach-reply" value={reply} onChange={event => setReply(event.target.value)} placeholder="e.g. Right hand" autoComplete="off"/><button type="submit" aria-label="Send reply" disabled={!reply.trim()}><Send size={18}/></button></div></form></>}
    {feedback && <p className="voice-feedback" role="status">{feedback}</p>}
    </div>
  </section>;
}
