import { useEffect, useState } from 'react';
import { ConversationProvider, useConversationControls, useConversationInput, useConversationMode, useConversationStatus } from '@elevenlabs/react';
import { Headphones, Mic, MicOff, PhoneOff } from 'lucide-react';
import { VOICE_AGENT_ID } from '../lib/voice';

export default function VoiceCoach({context}:{context:string}) {
 const [caption,setCaption]=useState('');
 return <ConversationProvider onMessage={message=>{if(message.source==='ai')setCaption(message.message);}}><CoachControls context={context} caption={caption} onStart={()=>setCaption('')}/></ConversationProvider>;
}
function CoachControls({context,caption,onStart}:{context:string;caption:string;onStart:()=>void}) {
 const {startSession,endSession,sendContextualUpdate}=useConversationControls();
 const {status,message}=useConversationStatus();const {isMuted,setMuted}=useConversationInput();const {isSpeaking}=useConversationMode();
 const [localError,setLocalError]=useState('');
 const connected=status==='connected'; const connecting=status==='connecting';
 useEffect(()=>{if(connected)sendContextualUpdate(`ReMotion exercise context: ${context}. Give brief supportive guidance, respect the user's configured pace and comfortable or prescribed range, and never diagnose recovery or ask for extra repetitions. The app controls recording and calibration; you cannot see camera frames.`)},[connected,context,sendContextualUpdate]);
 const start=()=>{setLocalError('');onStart();if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){setLocalError('Voice needs microphone access on localhost or HTTPS.');return;}startSession({agentId:VOICE_AGENT_ID,connectionType:'webrtc'});};
 return <section className="voice-coach" aria-label="Optional voice coach"><div className="voice-heading"><span className="icon-tile"><Headphones size={23}/></span><div><h3>A little guidance, out loud</h3><p role="status">{connecting?'Connecting your voice coach…':connected?(isSpeaking?'Your coach is speaking':isMuted?'Microphone muted':'Your coach is listening'):'Talk when you want a little support.'}</p></div></div>
 <p className="voice-privacy">Starting shares your microphone audio and exercise step with ElevenLabs. Your camera and hand recordings stay on this device. You can stop at any time.</p>
 <div className="voice-controls">{connected||connecting?<><button className="btn btn-secondary" onClick={endSession}><PhoneOff size={18}/>{connecting?'Cancel connection':'End voice coaching'}</button>{connected&&<button className="btn btn-secondary" onClick={()=>setMuted(!isMuted)} aria-pressed={isMuted}>{isMuted?<MicOff size={18}/>:<Mic size={18}/>} {isMuted?'Unmute microphone':'Mute microphone'}</button>}</>:<button className="btn btn-primary full" onClick={start}><Mic size={18}/>Start voice coach</button>}</div>
 {(status==='error'||localError)&&<p className="voice-error" role="alert">{localError||(/permission|denied|NotAllowed/i.test(message??'')?'Microphone access was declined. Allow it in your browser and try again.':'The voice coach couldn’t connect. Please try again. You can continue the exercise without it.')}</p>}
 {caption&&<div className="voice-caption" role="log" aria-label="Latest words from your coach"><span>YOUR COACH</span><p>{caption}</p></div>}
 </section>;
}
