import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { ConversationProvider } from "@elevenlabs/react";
import type { GuidedSessionController } from "../engine/sessionController";
import { parseSpokenControl } from "./spokenControls";

const Feedback = createContext({ lastReply: "", notice: "" });
export const useVoiceFeedback = () => useContext(Feedback);
export function ElevenLabsProvider({
  children,
  controller,
}: {
  children: ReactNode;
  controller: GuidedSessionController;
}) {
  const [lastReply, setLastReply] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <Feedback.Provider value={{ lastReply, notice }}>
      <ConversationProvider
        onConnect={() =>
          setNotice(
            "Voice connected. Your microphone is processed by ElevenLabs.",
          )
        }
        onDisconnect={() =>
          setNotice(
            "Voice is disconnected. Guided Text Mode and movement tracking are still available.",
          )
        }
        onError={() =>
          setNotice(
            "Voice is unavailable. Continue with the instructions on screen, or reconnect.",
          )
        }
        onMessage={(message) => {
          if (message.role === "agent" || message.source === "ai") {
            setLastReply(message.message.slice(0, 1500));
            return;
          }
          const control = parseSpokenControl(message.message);
          if (control === "stop") {
            void controller.stop();
            setNotice(
              "Exercise stopped. If you feel pain, dizziness, or discomfort, follow your clinician’s advice.",
            );
          } else if (control === "pause") controller.pause();
          else if (
            control === "resume" &&
            controller.getSnapshot().state.phase === "paused"
          )
            controller.resume();
        }}
      >
        {children}
      </ConversationProvider>
    </Feedback.Provider>
  );
}
