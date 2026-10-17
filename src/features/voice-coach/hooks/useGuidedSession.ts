import { useEffect, useRef, useSyncExternalStore } from "react";
import { GuidedSessionController } from "../engine/sessionController";
import type { VoiceCoachExperienceProps } from "../types/coach";
export function useGuidedSession(options: VoiceCoachExperienceProps) {
  const ref = useRef<GuidedSessionController | null>(null);
  ref.current ??= new GuidedSessionController(options);
  const controller = ref.current;
  controller.updateOptions(options);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useEffect(() => {
    const timer = window.setInterval(
      () => controller.tick(document.hidden),
      70,
    );
    return () => {
      clearInterval(timer);
      controller.dispose();
    };
  }, [controller]);
  return { controller, ...snapshot };
}
