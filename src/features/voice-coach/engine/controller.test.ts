import { describe, expect, it, vi } from "vitest";
import { createDemoSession, makeDemoHand } from "../../../lib/demo";
import { getPhase } from "../../../lib/geometry";
import { GuidedSessionController } from "./sessionController";
import type {
  CoachSessionRecord,
  CoachSessionRepository,
  MotionAdapter,
  MotionSample,
} from "../types/coach";

function fixture() {
  let now = 0;
  let sample: MotionSample | null = null;
  const records = new Map<string, CoachSessionRecord>();
  const repository: CoachSessionRepository = {
    save: vi.fn(async (session) => {
      records.set(session.id, session);
      return session;
    }),
    list: async () => [...records.values()],
    get: async (id) => records.get(id),
    getVideo: async () => undefined,
    delete: async (id) => {
      records.delete(id);
    },
  };
  const adapter: MotionAdapter = {
    videoRef: { current: null },
    overlayRef: { current: null },
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    getSample: () => sample,
    getStream: () => null,
    getStatus: () => ({ status: "ready" }),
  };
  const onSessionComplete = vi.fn(),
    onGardenReward = vi.fn();
  const controller = new GuidedSessionController(
    {
      motionAdapter: adapter,
      repository,
      initialCalibration: {
        ...createDemoSession().calibration,
        source: "personal",
      },
      onSessionComplete,
      onGardenReward,
    },
    () => now,
  );
  const step = (at: number, amount = 0, tracking = true) => {
    now = at;
    sample = {
      t: 0,
      observedAt: at,
      landmarks: tracking ? makeDemoHand(amount) : [],
      tracking,
      confidence: 0.9,
    };
    controller.tick();
  };
  return {
    controller,
    step,
    repository,
    adapter,
    onSessionComplete,
    onGardenReward,
    getNow: () => now,
  };
}
async function start(f: ReturnType<typeof fixture>) {
  f.controller.begin();
  await f.controller.enableCamera();
  f.step(10);
  f.controller.next();
  f.controller.next();
  f.controller.next();
  f.controller.consent(true);
  expect(f.controller.next()).toBe(true);
  expect(f.controller.getSnapshot().countdown).toBe(3);
  f.step(3100);
  await Promise.resolve();
  await Promise.resolve();
}
const settle = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
describe("independent flow orchestration", () => {
  it("records actual frames, evaluates only after completion, saves once and rewards once", async () => {
    const f = fixture();
    await start(f);
    expect(f.controller.getSnapshot().state.phase).toBe(
      "independent_recording",
    );
    expect(f.controller.getSnapshot().session).toBeNull();
    for (
      let i = 0;
      i <= 600 &&
      f.controller.getSnapshot().state.phase === "independent_recording";
      i++
    ) {
      const seconds = i * 0.05;
      f.step(3100 + i * 50, getPhase(seconds).amount);
    }
    await settle();
    const snapshot = f.controller.getSnapshot();
    expect(snapshot.state.phase).toBe("results");
    expect(snapshot.session?.completedRepetitions).toBe(3);
    expect(snapshot.session?.metrics.targetAttainmentPercent).not.toBeNull();
    expect(snapshot.session?.motionSession.frames.length).toBeGreaterThan(100);
    expect(snapshot.saved).toBe(true);
    expect(f.onSessionComplete).toHaveBeenCalledOnce();
    await Promise.all([f.controller.finish(), f.controller.finish()]);
    expect(f.onGardenReward).toHaveBeenCalledOnce();
    expect(f.controller.getSnapshot().state.phase).toBe("complete");
  });
  it("preserves a partial stop, pauses without counting, and restarts without page reload", async () => {
    const f = fixture();
    await start(f);
    for (let i = 0; i < 80; i++)
      f.step(3100 + i * 50, getPhase(i * 0.05).amount);
    f.controller.pause();
    const before = f.controller.getSnapshot().state.completedRepetitions;
    f.step(12000, 0);
    expect(f.controller.getSnapshot().state.completedRepetitions).toBe(before);
    expect(f.controller.getSnapshot().state.phase).toBe("paused");
    f.controller.resume();
    for (let i = 1; i <= 10; i++) f.step(12000 + i * 50, 0);
    await f.controller.stop();
    await settle();
    expect(
      f.controller.getSnapshot().session?.motionSession.frames.length,
    ).toBeGreaterThan(0);
    expect(f.controller.getSnapshot().session?.status).not.toBe("completed");
    await f.controller.finish();
    expect(f.onGardenReward).not.toHaveBeenCalled();
    f.controller.reset();
    expect(f.controller.getSnapshot().state.phase).toBe("idle");
    await start(f);
    expect(f.controller.getSnapshot().state.phase).toBe(
      "independent_recording",
    );
  });
  it("canceling the countdown never starts an unintended recording", async () => {
    const f = fixture();
    f.controller.begin();
    await f.controller.enableCamera();
    f.step(10);
    f.controller.next();
    f.controller.next();
    f.controller.next();
    f.controller.consent(true);
    f.controller.next();
    f.controller.pause();
    f.step(10000);
    expect(f.controller.getSnapshot().state.phase).toBe("paused");
    expect(f.controller.getSnapshot().session).toBeNull();
    expect(f.repository.save).not.toHaveBeenCalled();
  });
});
