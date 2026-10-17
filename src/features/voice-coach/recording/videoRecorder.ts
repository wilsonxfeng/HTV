export const VIDEO_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm",
];
export function selectVideoMimeType(
  supported: (type: string) => boolean,
): string | undefined {
  return VIDEO_MIME_TYPES.find((type) => supported(type));
}
export interface RecorderResult {
  blob: Blob | null;
  mimeType: string;
  startedAt: number;
  endedAt: number;
  warning?: string;
}
export class VideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private ownedStream: MediaStream | null = null;
  private startedAt = 0;
  private finish: Promise<RecorderResult> | null = null;
  private resolve: ((result: RecorderResult) => void) | null = null;
  private warning: string | undefined;
  private lastResult: RecorderResult | null = null;
  constructor(private now: () => number = () => performance.now()) {}
  async start(source: MediaStream): Promise<number> {
    if (this.recorder) throw new Error("Video recording already started.");
    if (typeof MediaRecorder === "undefined")
      throw new Error(
        "This browser cannot save video. Landmark recording will continue.",
      );
    const videoTracks = source
      .getVideoTracks()
      .filter((t) => t.readyState === "live");
    if (!videoTracks.length)
      throw new Error("No live camera track is available for video recording.");
    this.chunks = [];
    this.lastResult = null;
    this.warning = undefined;
    // Own cloned video tracks only. Stopping this recorder never stops the tracker or records microphone audio.
    this.ownedStream = new MediaStream(
      videoTracks.map((track) => track.clone()),
    );
    const mimeType = selectVideoMimeType((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    try {
      this.recorder = new MediaRecorder(this.ownedStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 1_200_000,
      });
    } catch (error) {
      this.releaseTracks();
      throw error;
    }
    const recorder = this.recorder;
    this.finish = new Promise((resolve) => {
      this.resolve = resolve;
    });
    let bytes = 0;
    recorder.ondataavailable = (event) => {
      if (event.data.size) {
        bytes += event.data.size;
        this.chunks.push(event.data);
        if (bytes > 60 * 1024 * 1024 && recorder.state !== "inactive") {
          this.warning =
            "Video reached the 60 MB limit and ended early. Landmarks continued.";
          recorder.stop();
        }
      }
    };
    recorder.onstop = () => this.finalize();
    recorder.onerror = () => {
      this.warning =
        "Video recording was interrupted. Landmark data is retained.";
      if (recorder.state !== "inactive") recorder.stop();
      else this.finalize();
    };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.abort();
        reject(
          new Error(
            "Video recording did not start. Landmark recording will continue.",
          ),
        );
      }, 5000);
      recorder.onstart = () => {
        clearTimeout(timeout);
        this.startedAt = this.now();
        resolve(this.startedAt);
      };
      try {
        recorder.start(1000);
      } catch (error) {
        clearTimeout(timeout);
        this.abort();
        reject(error);
      }
    });
  }
  pause() {
    if (this.recorder?.state === "recording") this.recorder.pause();
  }
  resume() {
    if (this.recorder?.state === "paused") this.recorder.resume();
  }
  async stop(): Promise<RecorderResult> {
    if (!this.recorder || !this.finish)
      return (
        this.lastResult ?? {
          blob: null,
          mimeType: "",
          startedAt: this.startedAt,
          endedAt: this.now(),
        }
      );
    if (this.recorder.state !== "inactive") this.recorder.stop();
    const timeout = setTimeout(() => {
      this.warning =
        "Video finalization timed out; any available video may be incomplete.";
      this.finalize();
    }, 5000);
    const result = await this.finish;
    clearTimeout(timeout);
    return result;
  }
  abort() {
    this.lastResult = null;
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* already ended */
      }
    }
    this.releaseTracks();
    this.recorder = null;
    this.chunks = [];
    this.resolve?.({
      blob: null,
      mimeType: "",
      startedAt: this.startedAt,
      endedAt: this.now(),
      warning: "Video capture cancelled.",
    });
    this.resolve = null;
    this.lastResult = null;
  }
  private releaseTracks() {
    this.ownedStream?.getTracks().forEach((t) => t.stop());
    this.ownedStream = null;
  }
  private finalize() {
    if (!this.resolve) return;
    const mimeType =
      this.recorder?.mimeType || this.chunks[0]?.type || "video/webm";
    const blob = this.chunks.length
      ? new Blob(this.chunks, { type: mimeType })
      : null;
    this.lastResult = {
      blob,
      mimeType,
      startedAt: this.startedAt,
      endedAt: this.now(),
      warning: this.warning,
    };
    this.resolve(this.lastResult);
    this.resolve = null;
    this.recorder = null;
    this.chunks = [];
    this.releaseTracks();
  }
}
