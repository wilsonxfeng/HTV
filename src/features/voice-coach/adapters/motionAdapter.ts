import { useMemo, useRef } from "react";
import { useHandTracker } from "../../../lib/useHandTracker";
import type { MotionAdapter } from "../types/coach";
/** Reuses the existing detector, overlay and camera. Mount this hook once per experience. */
export function useExistingMotionAdapter(): MotionAdapter {
  const tracker = useHandTracker();
  const current = useRef(tracker);
  current.current = tracker;
  return useMemo(
    () => ({
      videoRef: tracker.videoRef,
      overlayRef: tracker.canvasRef,
      async start() {
        await current.current.start();
        const stream = current.current.videoRef.current?.srcObject;
        if (
          !(stream instanceof MediaStream) ||
          !stream.getVideoTracks().some((t) => t.readyState === "live")
        )
          throw new Error(
            current.current.error ||
              "Camera could not be enabled. Allow camera access and retry.",
          );
      },
      stop: () => current.current.stop(),
      getSample: () => current.current.latestRef.current,
      getStream: () => {
        const source = current.current.videoRef.current?.srcObject;
        return source instanceof MediaStream ? source : null;
      },
      getStatus: () => ({
        status: current.current.status,
        error: current.current.error,
      }),
      lockIdentity: (label) => current.current.lockIdentity(label),
    }),
    [tracker.videoRef, tracker.canvasRef],
  );
}
