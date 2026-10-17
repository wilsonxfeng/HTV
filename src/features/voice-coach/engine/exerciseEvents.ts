/** Stable hand-presence events, independent of frame rate. */
export class TrackingEvents {
  private candidate: boolean | null = null;
  private since = 0;
  private stable = false;
  update(
    tracked: boolean,
    now: number,
  ): "HAND_DETECTED" | "TRACKING_LOST" | null {
    if (this.candidate !== tracked) {
      this.candidate = tracked;
      this.since = now;
    }
    if (tracked !== this.stable && now - this.since >= (tracked ? 500 : 850)) {
      this.stable = tracked;
      return tracked ? "HAND_DETECTED" : "TRACKING_LOST";
    }
    return null;
  }
}
