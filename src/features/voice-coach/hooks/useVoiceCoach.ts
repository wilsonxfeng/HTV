import { useEffect, useMemo, useRef, useState } from "react";
import {
  useConversationClientTool,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import type { CoachPhase, VoiceConfiguration } from "../types/coach";
import type {
  GuidedSessionController,
  GuidedSnapshot,
} from "../engine/sessionController";
import {
  resolveConnection,
  ConversationCueQueue,
} from "../elevenlabs/conversationAdapter";
import { CoachingEventBridge } from "../elevenlabs/coachingEvents";
import { defaultVoiceConfiguration } from "../elevenlabs/coachConfiguration";
import { useVoiceFeedback } from "../elevenlabs/ElevenLabsProvider";

export function useVoiceCoach(
  controller: GuidedSessionController,
  snapshot: GuidedSnapshot,
  configuration = defaultVoiceConfiguration as VoiceConfiguration,
) {
  const controls = useConversationControls(),
    { status } = useConversationStatus(),
    { isSpeaking } = useConversationMode(),
    { isMuted, setMuted } = useConversationInput();
  const feedback = useVoiceFeedback();
  const [problem, setProblem] = useState("");
  const [connecting, setConnecting] = useState(false);
  const latest = useRef({ status, isSpeaking, snapshot });
  latest.current = { status, isSpeaking, snapshot };
  const generation = useRef(0);
  const lastEvent = useRef("");
  const authorization = useRef<AbortController | null>(null);
  const queue = useMemo(() => new ConversationCueQueue(controls), [controls]);
  const bridge = useMemo(
    () => new CoachingEventBridge(controller.getSessionId()),
    [controller, snapshot.events[0]?.sessionId],
  );
  useConversationClientTool("getExerciseStatus", () =>
    JSON.stringify({
      phase: controller.getSnapshot().state.phase,
      revision: controller.getSnapshot().state.revision,
      handTracked: controller.getSnapshot().state.tracking,
      calibrated: controller.getSnapshot().state.calibrated,
      completedRepetitions: controller.getSnapshot().state.completedRepetitions,
      plannedRepetitions: controller.getSnapshot().state.plannedRepetitions,
      recordingConsented: controller.getSnapshot().state.recordingConsent,
    }),
  );
  useConversationClientTool("requestPause", () => {
    controller.pause();
    return "Pause requested; application state is authoritative.";
  });
  useConversationClientTool("requestResume", (parameters) =>
    Number.isInteger(parameters.expectedRevision) &&
    controller.resume(Number(parameters.expectedRevision))
      ? "Resumed."
      : "Rejected: current phase or revision does not permit resuming.",
  );
  useConversationClientTool("requestNextPhase", (parameters) => {
    const phases: CoachPhase[] = [
      "guided_demo",
      "guided_practice",
      "independent_intro",
      "independent_recording",
    ];
    if (
      typeof parameters.requestedPhase !== "string" ||
      !phases.includes(parameters.requestedPhase as CoachPhase) ||
      !Number.isInteger(parameters.expectedRevision)
    )
      return "Rejected: supply an allowed phase and the current integer revision from getExerciseStatus.";
    return controller.next(
      parameters.requestedPhase as CoachPhase,
      Number(parameters.expectedRevision),
    )
      ? "Request accepted by the application. Read status for the actual phase; independent recording uses a consent-checked countdown."
      : "Rejected by application guards. Ask the user to use the visible controls.";
  });
  useConversationClientTool("repeatInstruction", () => {
    return controller.getSnapshot().caption;
  });
  useEffect(() => {
    queue.cancel();
    if (status === "connected" && snapshot.state.phase !== "analyzing")
      queue.enqueue(
        snapshot.state.phase === "results" && snapshot.session
          ? snapshot.session.coachSummary
          : snapshot.caption,
        snapshot.state.phase,
        snapshot.state.revision,
      );
  }, [
    snapshot.caption,
    snapshot.state.phase,
    snapshot.state.revision,
    snapshot.session?.id,
    status,
    queue,
  ]);
  useEffect(() => {
    if (status !== "connected") return;
    try {
      controls.sendContextualUpdate(
        "APPLICATION OPERATING CONTRACT: You are ReMotion Coach, a warm, patient hand-exercise companion. Use concise supportive sentences. Never diagnose, prescribe extra repetitions, or encourage pushing through pain. Only the application establishes hand visibility, phases, repetition counts, and measured results. Do not infer camera observations from conversation. A contextual update is background; application coaching cues request a brief spoken instruction. During independent_recording stay quiet except essential assistance. User stop or discomfort takes priority. The current caption and revision are authoritative. Never claim clinical recovery from movement-goal percentages.",
      );
    } catch {
      setProblem(
        "Voice context could not be delivered. Guided Text Mode continues.",
      );
    }
  }, [status, controls]);
  useEffect(() => {
    if (status === "connected") {
      try {
        controls.sendUserActivity();
      } catch {
        /* transport may already be disconnected */
      }
    }
  }, [snapshot.state.revision, status, controls, queue]);
  useEffect(() => {
    if (status !== "connected") return;
    try {
      const s = snapshot.state;
      controls.sendContextualUpdate(
        JSON.stringify({
          application: "ReMotion",
          phase: s.phase,
          revision: s.revision,
          handTracked: s.tracking,
          calibrated: s.calibrated,
          plannedRepetitions: s.plannedRepetitions,
          completedRepetitions: s.completedRepetitions,
          instruction: snapshot.caption,
          safety:
            "Only the application controls progression. During independent_recording stay quiet except essential tracking/safety assistance. Do not invent measurements.",
        }),
      );
      for (const event of snapshot.events) {
        if (event.id === lastEvent.current) continue;
        const accepted = bridge.accept(event, s.phase, s.revision);
        if (!accepted) continue;
        lastEvent.current = event.id;
        controls.sendContextualUpdate(accepted.context);
        if (accepted.speak)
          queue.enqueue(
            event.type === "HAND_DETECTED"
              ? "The app can see your hand."
              : "The app lost sight of your hand. Move the same hand back into the frame.",
            s.phase,
            s.revision,
          );
      }
    } catch {
      setProblem(
        "Voice context could not be delivered. Guided Text Mode continues.",
      );
    }
  }, [
    snapshot.state.phase,
    snapshot.state.revision,
    snapshot.state.tracking,
    snapshot.state.completedRepetitions,
    snapshot.caption,
    snapshot.events,
    status,
    controls,
    bridge,
    queue,
  ]);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = latest.current;
      try {
        queue.flush(
          current.status === "connected",
          current.isSpeaking,
          current.snapshot.state.phase,
          current.snapshot.state.revision,
        );
      } catch {
        queue.cancel();
        setProblem(
          "Voice is unavailable. Continue with the written instructions.",
        );
      }
    }, 300);
    return () => clearInterval(timer);
  }, [queue]);
  useEffect(
    () => () => {
      generation.current++;
      authorization.current?.abort();
      queue.cancel();
      controls.endSession();
    },
    [controls, queue],
  );
  async function connect() {
    if (connecting || status === "connected" || status === "connecting") return;
    const run = ++generation.current;
    setConnecting(true);
    setProblem("");
    try {
      authorization.current?.abort();
      authorization.current = new AbortController();
      const options = await resolveConnection(
        configuration,
        fetch,
        authorization.current.signal,
      );
      if (run !== generation.current) return;
      controls.startSession(options);
    } catch (error) {
      if (run === generation.current)
        setProblem(
          error instanceof Error
            ? error.message
            : "Voice could not connect. Guided Text Mode is ready.",
        );
    } finally {
      if (run === generation.current) setConnecting(false);
    }
  }
  useEffect(() => {
    if (status !== "connecting") return;
    const timeout = setTimeout(() => {
      controls.endSession();
      setProblem(
        "Voice took too long to connect. Continue in Guided Text Mode or retry.",
      );
    }, 18000);
    return () => clearTimeout(timeout);
  }, [status, controls]);
  const disconnect = () => {
    generation.current++;
    authorization.current?.abort();
    queue.cancel();
    controls.endSession();
    setConnecting(false);
  };
  return {
    status,
    isSpeaking,
    isMuted,
    connecting: connecting || status === "connecting",
    lastReply: feedback.lastReply,
    notice: problem || feedback.notice,
    connect,
    disconnect,
    mute: () => setMuted(!isMuted),
    repeat: (text?: string) => {
      const s = controller.getSnapshot();
      queue.enqueue(text ?? s.caption, s.state.phase, s.state.revision);
    },
  };
}
