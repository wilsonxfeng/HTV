import { VoiceCoachAvatar } from "./VoiceCoachAvatar";
import { VoiceCoachControls } from "./VoiceCoachControls";
import type { useVoiceCoach } from "../hooks/useVoiceCoach";
export function VoiceCoachPanel({
  caption,
  voice,
}: {
  caption: string;
  voice: ReturnType<typeof useVoiceCoach>;
}) {
  return (
    <section className="vc-coach-panel" aria-label="Your rehabilitation coach">
      <div className="vc-coach-top">
        <VoiceCoachAvatar
          speaking={voice.isSpeaking}
          listening={voice.status === "connected" && !voice.isSpeaking}
        />
        <div>
          <span className="vc-eyebrow">A LITTLE PRACTICE, TOGETHER</span>
          <h2>Your ReMotion coach</h2>
          <span className="vc-connection">
            <i />
            {voice.status === "connected"
              ? voice.isMuted
                ? "Microphone muted"
                : voice.isSpeaking
                  ? "Coach is speaking"
                  : "Listening to you"
              : "Guided Text Mode"}
          </span>
        </div>
      </div>
      <p className="vc-caption" aria-live="polite">
        {caption}
      </p>
      <VoiceCoachControls voice={voice} />
      {voice.notice && (
        <p className="vc-help" role="status">
          {voice.notice}
        </p>
      )}
      {voice.lastReply && voice.status === "connected" && (
        <details className="vc-transcript">
          <summary>Last voice response</summary>
          <p>{voice.lastReply}</p>
          <small>
            Movement measurements and the step shown above come from the app.
          </small>
        </details>
      )}
      <p className="vc-privacy">
        Camera tracking runs on this device. Connected voice sends microphone
        audio and a small exercise summary to ElevenLabs. Voice
        recordings/transcripts may be retained according to your ElevenLabs
        agent settings. Webcam video is never sent to the coach.
      </p>
    </section>
  );
}
