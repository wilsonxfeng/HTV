import type {
  MotionSample,
  RecordingArtifact,
  HandFrame,
} from "../types/coach";
import { VideoRecorder } from "./videoRecorder";
export class SynchronizedRecorder {
  private video: VideoRecorder;
  private startAt = 0;
  private requestAt = 0;
  private pausedAt: number | null = null;
  private pauses: { startMs: number; endMs: number }[] = [];
  private frames: HandFrame[] = [];
  private lastObservation = -Infinity;
  private running = false;
  private warning: string | undefined;
  private hasVideo = false;
  constructor(
    private now: () => number = () => performance.now(),
    video?: VideoRecorder,
  ) {
    this.video = video ?? new VideoRecorder(now);
  }
  async start(stream: MediaStream | null, videoOptIn: boolean) {
    this.requestAt = this.now();
    this.startAt = this.requestAt;
    this.frames = [];
    this.pauses = [];
    this.pausedAt = null;
    this.lastObservation = -Infinity;
    this.warning = undefined;
    this.hasVideo = false;
    if (videoOptIn) {
      try {
        if (!stream) throw new Error("No camera stream is available.");
        this.startAt = await this.video.start(stream);
        this.hasVideo = true;
      } catch (error) {
        this.warning =
          error instanceof Error ? error.message : "Video unavailable.";
        this.startAt = this.now();
      }
    }
    this.running = true;
  }
  elapsed(at = this.now()): number {
    const end = this.pausedAt === null ? at : Math.min(at, this.pausedAt);
    const paused = this.pauses.reduce(
      (sum, p) =>
        sum +
        Math.max(
          0,
          Math.min(end, this.startAt + p.endMs) - (this.startAt + p.startMs),
        ),
      0,
    );
    return Math.max(0, end - this.startAt - paused);
  }
  capture(sample: MotionSample | null, hidden = false) {
    if (!this.running || this.pausedAt !== null) return;
    const now = this.now();
    const fresh =
      sample &&
      sample.observedAt > this.lastObservation &&
      sample.observedAt >= this.startAt &&
      now - sample.observedAt <= 200;
    if (fresh) {
      this.lastObservation = sample.observedAt;
      const t = this.elapsed(sample.observedAt) / 1000;
      if (this.frames.length && t <= this.frames[this.frames.length - 1].t)
        return;
      const tracking = sample.tracking && !hidden;
      this.frames.push({
        t,
        tracking,
        landmarks: tracking ? sample.landmarks.map((p) => ({ ...p })) : [],
        worldLandmarks: tracking
          ? sample.worldLandmarks?.map((p) => ({ ...p }))
          : undefined,
        imageLandmarks: tracking
          ? sample.imageLandmarks?.map((p) => ({ ...p }))
          : undefined,
        confidence: tracking ? sample.confidence : 0,
        modelHandedness: sample.modelHandedness,
      });
    } else if (
      !sample ||
      !sample.tracking ||
      now - sample.observedAt > 200 ||
      hidden ||
      !this.frames.length
    ) {
      const t = this.elapsed() / 1000;
      if (!this.frames.length || t > this.frames[this.frames.length - 1].t)
        this.frames.push({ t, landmarks: [], tracking: false, confidence: 0 });
    }
  }
  getFrames() {
    return this.frames;
  }
  pause() {
    if (this.pausedAt !== null || !this.running) return;
    this.pausedAt = this.now();
    this.video.pause();
  }
  resume() {
    if (this.pausedAt === null) return;
    const end = this.now();
    this.pauses.push({
      startMs: this.pausedAt - this.startAt,
      endMs: end - this.startAt,
    });
    this.pausedAt = null;
    this.lastObservation = end;
    this.video.resume();
    const t = this.elapsed() / 1000;
    this.frames.push({ t, landmarks: [], tracking: false, confidence: 0 });
  }
  async stop(): Promise<RecordingArtifact> {
    const durationMs = this.elapsed();
    this.running = false;
    const video = this.hasVideo
      ? await this.video.stop()
      : {
          blob: null,
          mimeType: "",
          startedAt: this.startAt,
          endedAt: this.now(),
          warning: undefined,
        };
    return {
      blob: video.blob,
      frames: [...this.frames],
      durationMs,
      warning: this.warning ?? video.warning,
      ...(this.hasVideo
        ? {
            metadata: {
              mimeType: video.mimeType,
              durationMs: Math.max(
                0,
                video.endedAt -
                  this.startAt -
                  this.pauses.reduce((n, p) => n + p.endMs - p.startMs, 0) -
                  (this.pausedAt === null ? 0 : video.endedAt - this.pausedAt),
              ),
              startOffsetMs: this.startAt - this.requestAt,
              synchronization: "measured-browser-clock" as const,
              pauseIntervals: [...this.pauses],
              warning: video.warning,
            },
          }
        : {}),
    };
  }
  abort() {
    this.running = false;
    this.video.abort();
  }
}
