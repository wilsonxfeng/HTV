import type { CoachingEvent, CoachPhase } from "../types/coach";
export class CoachingEventBridge {
  private seen = new Set<string>();
  private sequence = 0;
  private lastTrackingSpeech = -Infinity;
  constructor(private sessionId: string) {}
  accept(
    event: CoachingEvent,
    phase: CoachPhase,
    revision: number,
  ): { context: string; speak: boolean } | null {
    if (
      event.sessionId !== this.sessionId ||
      event.sequence <= this.sequence ||
      this.seen.has(event.id) ||
      event.revision !== revision ||
      event.phase !== phase
    )
      return null;
    this.sequence = event.sequence;
    this.seen.add(event.id);
    const essential = ["TRACKING_LOST", "HAND_DETECTED"].includes(event.type);
    const speak =
      !essential || event.timestampMs - this.lastTrackingSpeech >= 9000;
    if (essential && speak) this.lastTrackingSpeech = event.timestampMs;
    const payload =
      event.type === "ANALYSIS_READY"
        ? { type: event.type, summary: event.summary }
        : "count" in event
          ? { type: event.type, count: event.count }
          : { type: event.type };
    return {
      context: JSON.stringify({
        application: "ReMotion",
        phase,
        revision,
        event: payload,
      }),
      speak: essential && speak && phase !== "paused",
    };
  }
}
