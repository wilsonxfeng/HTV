import { pairAngles, validFrame } from "../../../lib/geometry";
import type { Calibration, HandFrame, RepetitionMarker } from "../types/coach";
/** Hysteresis + sustained opening/closing. Never counts a tracking gap as a close. */
export class RepetitionController {
  private state: "waiting_close" | "closed" | "open" = "waiting_close";
  private stableAt: number | null = null;
  private lastTime = -Infinity;
  private start = 0;
  private peak = 0;
  private peakTime = 0;
  private count = 0;
  constructor(
    private calibration: Calibration | null,
    private planned: number,
  ) {}
  resetCycle() {
    this.state = "waiting_close";
    this.stableAt = null;
    this.lastTime = -Infinity;
  }
  setCount(count: number) {
    this.count = Math.min(count, this.planned);
    this.resetCycle();
  }
  observe(frame: HandFrame): RepetitionMarker | null {
    if (!this.calibration || this.count >= this.planned) return null;
    if (
      !validFrame(frame) ||
      frame.t <= this.lastTime ||
      frame.t - this.lastTime > 0.25
    ) {
      const first = this.lastTime === -Infinity;
      this.lastTime = frame.t;
      if (!first) {
        this.state = "waiting_close";
        this.stableAt = null;
        return null;
      }
      if (!validFrame(frame)) return null;
    }
    this.lastTime = frame.t;
    const neutral = pairAngles(this.calibration.neutral),
      target = pairAngles(this.calibration.target),
      angles = pairAngles(frame.landmarks);
    const ratios = angles
      .slice(1)
      .flatMap((angle, i) =>
        target[i + 1] - neutral[i + 1] >= 2
          ? [(angle - neutral[i + 1]) / (target[i + 1] - neutral[i + 1])]
          : [],
      );
    if (!ratios.length) return null;
    const amount = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const spread = angles.slice(1).reduce((a, b) => a + b, 0) / 3;
    const dwell = (condition: boolean) => {
      if (!condition) {
        this.stableAt = null;
        return false;
      }
      this.stableAt ??= frame.t;
      return frame.t - this.stableAt >= 0.22;
    };
    if (this.state === "waiting_close" && dwell(amount <= 0.25)) {
      this.state = "closed";
      this.start = frame.t;
      this.stableAt = null;
    } else if (this.state === "closed" && dwell(amount >= 0.55)) {
      this.state = "open";
      this.peak = spread;
      this.peakTime = frame.t;
      this.stableAt = null;
    } else if (this.state === "open") {
      if (spread > this.peak) {
        this.peak = spread;
        this.peakTime = frame.t;
      }
      if (dwell(amount <= 0.3) && frame.t - this.start >= 1) {
        this.count += 1;
        const marker: RepetitionMarker = {
          id: `rep-${this.count}`,
          startMs: this.start * 1000,
          peakMs: this.peakTime * 1000,
          endMs: frame.t * 1000,
          source: "vision",
          peakSpread: this.peak,
        };
        this.state = "closed";
        this.start = frame.t;
        this.stableAt = null;
        return marker;
      }
    }
    return null;
  }
}
