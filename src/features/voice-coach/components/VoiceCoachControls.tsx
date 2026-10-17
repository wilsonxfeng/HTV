import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import type { useVoiceCoach } from "../hooks/useVoiceCoach";
export function VoiceCoachControls({
  voice,
}: {
  voice: ReturnType<typeof useVoiceCoach>;
}) {
  return (
    <div className="vc-voice-controls">
      {voice.status === "connected" ? (
        <>
          <button
            type="button"
            className="vc-secondary"
            onClick={voice.mute}
            aria-pressed={voice.isMuted}
          >
            {voice.isMuted ? <MicOff size={18} /> : <Mic size={18} />}{" "}
            {voice.isMuted ? "Unmute microphone" : "Mute microphone"}
          </button>
          <button
            type="button"
            className="vc-secondary"
            onClick={voice.disconnect}
          >
            <PhoneOff size={18} />
            Disconnect voice
          </button>
          <button
            type="button"
            className="vc-icon-button"
            aria-label="Repeat instruction"
            onClick={() => voice.repeat()}
          >
            <Volume2 size={20} />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="vc-primary"
            disabled={voice.connecting}
            onClick={() => void voice.connect()}
          >
            <Mic size={18} />
            {voice.connecting ? "Connecting…" : "Connect voice coach"}
          </button>
          <span className="vc-text-mode">
            Guided Text Mode is always available
          </span>
        </>
      )}
    </div>
  );
}
