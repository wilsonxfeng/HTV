import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecordingRepository } from "./recordingRepository";
import { sampleCoachSession } from "../demo/sampleCoachSession";
import { selectVideoMimeType, VideoRecorder } from "./videoRecorder";
import { SynchronizedRecorder } from "./synchronizedRecorder";
import { makeDemoHand } from "../../../lib/demo";

describe("local persistence", () => {
  it("retains measurement data and reports video unavailable after quota exhaustion", async () => {
    const repository = createRecordingRepository(
      `coach-quota-${crypto.randomUUID()}`,
    );
    const original = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (this.name === "videos")
          throw new DOMException("full", "QuotaExceededError");
        return key === undefined
          ? original.call(this, value)
          : original.call(this, value, key);
      });
    try {
      const saved = await repository.save(
        sampleCoachSession(),
        new Blob(["video"]),
      );
      expect(saved.videoAvailable).toBe(false);
      expect(saved.recordingId).toBeUndefined();
      expect((await repository.list()).length).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
  it("atomically saves, loads, replaces and deletes the actual blob with its session", async () => {
    const repository = createRecordingRepository(
      `coach-test-${crypto.randomUUID()}`,
    );
    const session = sampleCoachSession();
    const video = new Blob(["video-payload"], { type: "video/webm" });
    const saved = await repository.save(session, video);
    expect(saved.videoAvailable).toBe(true);
    expect(saved.recordingId).toBe(session.id);
    expect(await (await repository.getVideo(session.id))?.text()).toBe(
      "video-payload",
    );
    expect((await repository.get(session.id))?.completedRepetitions).toBe(3);
    await repository.save({ ...saved, rewardDelivered: true });
    expect((await repository.list())[0].rewardDelivered).toBe(true);
    await repository.delete(session.id);
    expect(await repository.get(session.id)).toBeUndefined();
    expect(await repository.getVideo(session.id)).toBeUndefined();
  });
  it("saves landmarks without pretending that a video exists", async () => {
    const repository = createRecordingRepository(
      `coach-test-${crypto.randomUUID()}`,
    );
    const result = await repository.save(sampleCoachSession());
    expect(result.videoAvailable).toBe(false);
    expect(result.recordingId).toBeUndefined();
  });
});
describe("synchronized clocks and privacy", () => {
  it("never attaches a previous session video when the next session declines video storage", async () => {
    let now = 1000;
    const video = {
      start: vi.fn(async () => now),
      stop: vi.fn(async () => ({
        blob: new Blob(["previous-video"]),
        mimeType: "video/webm",
        startedAt: 1000,
        endedAt: now,
      })),
      pause: vi.fn(),
      resume: vi.fn(),
      abort: vi.fn(),
    } as unknown as VideoRecorder;
    const recorder = new SynchronizedRecorder(() => now, video);
    await recorder.start({} as MediaStream, true);
    now = 2000;
    expect((await recorder.stop()).blob).not.toBeNull();
    await recorder.start(null, false);
    now = 3000;
    expect((await recorder.stop()).blob).toBeNull();
    expect(video.stop).toHaveBeenCalledOnce();
  });
  it("selects an actually supported codec and allows a browser default", () => {
    expect(selectVideoMimeType((type) => type === "video/mp4")).toBe(
      "video/mp4",
    );
    expect(selectVideoMimeType(() => false)).toBeUndefined();
  });
  it("records fresh inference timestamps, retains tracking gaps and removes paused wall time", async () => {
    let now = 1000;
    const recorder = new SynchronizedRecorder(() => now);
    await recorder.start(null, false);
    now = 1100;
    recorder.capture({
      t: 0,
      observedAt: 1080,
      tracking: true,
      landmarks: makeDemoHand(0.5),
      confidence: 0.9,
    });
    now = 1150;
    recorder.capture({
      t: 0,
      observedAt: 1080,
      tracking: true,
      landmarks: makeDemoHand(0.5),
      confidence: 0.9,
    });
    expect(recorder.getFrames()).toHaveLength(1);
    expect(recorder.getFrames()[0].t).toBeCloseTo(0.08);
    now = 1500;
    recorder.capture({
      t: 0,
      observedAt: 1080,
      tracking: true,
      landmarks: makeDemoHand(0.5),
      confidence: 0.9,
    });
    expect(recorder.getFrames().at(-1)?.tracking).toBe(false);
    recorder.pause();
    now = 4500;
    expect(recorder.elapsed()).toBe(500);
    recorder.resume();
    now = 4600;
    recorder.capture({
      t: 0,
      observedAt: 4590,
      tracking: true,
      landmarks: makeDemoHand(1),
      confidence: 0.9,
    });
    const result = await recorder.stop();
    expect(result.durationMs).toBe(600);
    expect(result.frames.at(-1)?.t).toBeCloseTo(0.59);
    expect(result.blob).toBeNull();
  });
  it("falls back to landmarks when video is unsupported", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const recorder = new SynchronizedRecorder(() => 1000);
    await recorder.start(
      { getVideoTracks: () => [] } as unknown as MediaStream,
      true,
    );
    const result = await recorder.stop();
    expect(result.warning).toContain("cannot save video");
    expect(result.blob).toBeNull();
    vi.unstubAllGlobals();
  });
});
describe("video lifecycle", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("records video-only clones, finalizes once, and never stops the tracker or microphone", async () => {
    const originalVideoStop = vi.fn(),
      audioStop = vi.fn(),
      cloneStop = vi.fn();
    const clone = { stop: cloneStop, readyState: "live", kind: "video" };
    const source = {
      getVideoTracks: () => [
        { readyState: "live", clone: () => clone, stop: originalVideoStop },
      ],
      getAudioTracks: () => [{ stop: audioStop }],
    } as unknown as MediaStream;
    class Stream {
      constructor(public tracks: (typeof clone)[]) {}
      getTracks() {
        return this.tracks;
      }
    }
    class Recorder {
      static isTypeSupported(type: string) {
        return type === "video/mp4";
      }
      state = "inactive";
      mimeType = "video/mp4";
      onstart: (() => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      constructor(public stream: Stream) {
        expect(stream.getTracks()).toEqual([clone]);
      }
      start() {
        this.state = "recording";
        queueMicrotask(() => this.onstart?.());
      }
      pause() {
        this.state = "paused";
      }
      resume() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["silent-video"], { type: this.mimeType }),
        });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaStream", Stream);
    vi.stubGlobal("MediaRecorder", Recorder);
    const recorder = new VideoRecorder(() => 2000);
    expect(await recorder.start(source)).toBe(2000);
    recorder.pause();
    recorder.resume();
    const result = await recorder.stop();
    expect(await result.blob?.text()).toBe("silent-video");
    expect(cloneStop).toHaveBeenCalledOnce();
    expect(originalVideoStop).not.toHaveBeenCalled();
    expect(audioStop).not.toHaveBeenCalled();
    await recorder.stop();
    expect(cloneStop).toHaveBeenCalledOnce();
  });
});
