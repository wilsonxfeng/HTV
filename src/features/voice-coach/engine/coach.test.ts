import { describe, expect, it, vi } from "vitest";
import { createDemoSession, makeDemoHand } from "../../../lib/demo";
import { getPhase } from "../../../lib/geometry";
import { initialCoachState, transitionCoach } from "./coachingStateMachine";
import { RepetitionController } from "./repetitionController";
import { TrackingEvents } from "./exerciseEvents";
import {
  evaluateCompletedSession,
  isComparable,
  addSessionComparison,
} from "./sessionEvaluator";
import {
  generateLongitudinalSummary,
  structuredSummary,
} from "./summaryGenerator";
import { sampleCoachSession } from "../demo/sampleCoachSession";
import { GardenRewardDispatcher } from "../adapters/sessionAdapter";
import { CoachingEventBridge } from "../elevenlabs/coachingEvents";
import { ConversationCueQueue } from "../elevenlabs/conversationAdapter";
import type { CoachState, CoachingEvent, HandFrame } from "../types/coach";

function intro(): CoachState {
  let state = initialCoachState();
  state = transitionCoach(state, { type: "BEGIN" });
  state = transitionCoach(state, { type: "CAMERA_READY" });
  state = transitionCoach(state, { type: "TRACKING", value: true });
  state = transitionCoach(state, { type: "CALIBRATED" });
  for (let i = 0; i < 3; i++) state = transitionCoach(state, { type: "NEXT" });
  return state;
}
describe("deterministic progression and safety", () => {
  it("never skips camera, calibration, explicit consent, or tracking guards", () => {
    const idle = initialCoachState();
    expect(
      transitionCoach(idle, {
        type: "NEXT",
        requestedPhase: "independent_recording",
      }),
    ).toBe(idle);
    const state = intro();
    expect(state.phase).toBe("independent_intro");
    expect(transitionCoach(state, { type: "NEXT" })).toBe(state);
    const consented = transitionCoach(state, { type: "CONSENT", value: true });
    expect(transitionCoach(consented, { type: "NEXT" }).phase).toBe(
      "independent_recording",
    );
    const lost = transitionCoach(consented, { type: "TRACKING", value: false });
    expect(transitionCoach(lost, { type: "NEXT" })).toBe(lost);
    expect(
      transitionCoach(
        transitionCoach(lost, { type: "ACKNOWLEDGE_TRACKING", value: true }),
        { type: "NEXT" },
      ).phase,
    ).toBe("independent_recording");
  });
  it("rejects late phase requests, duplicate counts and extra repetitions", () => {
    let state = intro();
    state = transitionCoach(state, { type: "CONSENT", value: true });
    const previousRevision = state.revision - 1;
    expect(
      transitionCoach(state, {
        type: "NEXT",
        requestedPhase: "independent_recording",
        expectedRevision: previousRevision,
      }),
    ).toBe(state);
    state = transitionCoach(state, { type: "NEXT" });
    for (let i = 1; i <= 3; i++)
      state = transitionCoach(state, { type: "REPETITION", count: i });
    expect(state.completedRepetitions).toBe(3);
    expect(transitionCoach(state, { type: "REPETITION", count: 4 })).toBe(
      state,
    );
    expect(transitionCoach(state, { type: "REPETITION", count: 3 })).toBe(
      state,
    );
    expect(
      transitionCoach(state, { type: "PLAN", value: 5 }).plannedRepetitions,
    ).toBe(3);
  });
  it("pause, resume, stop and finalization have explicit legal transitions", () => {
    let state = transitionCoach(
      transitionCoach(intro(), { type: "CONSENT", value: true }),
      { type: "NEXT" },
    );
    state = transitionCoach(state, { type: "PAUSE" });
    expect(state.phase).toBe("paused");
    expect(transitionCoach(state, { type: "REPETITION", count: 1 })).toBe(
      state,
    );
    expect(transitionCoach(state, { type: "RESUME" }).phase).toBe(
      "independent_recording",
    );
    state = transitionCoach(state, { type: "STOP" });
    expect(state.phase).toBe("analyzing");
    expect(transitionCoach(state, { type: "FINISH" })).toBe(state);
    state = transitionCoach(state, { type: "ANALYSIS_READY" });
    expect(transitionCoach(state, { type: "FINISH" }).phase).toBe("complete");
  });
});
describe("vision events and real cycle counting", () => {
  it("debounces loss and recovery, rather than responding to every frame", () => {
    const events = new TrackingEvents();
    expect(events.update(true, 0)).toBeNull();
    expect(events.update(true, 499)).toBeNull();
    expect(events.update(true, 501)).toBe("HAND_DETECTED");
    expect(events.update(true, 800)).toBeNull();
    expect(events.update(false, 900)).toBeNull();
    expect(events.update(true, 1000)).toBeNull();
    expect(events.update(false, 1100)).toBeNull();
    expect(events.update(false, 2000)).toBe("TRACKING_LOST");
    expect(events.update(false, 3000)).toBeNull();
  });
  it("counts sustained together–spread–close cycles once, and stops at the plan", () => {
    const detector = new RepetitionController(
      createDemoSession().calibration,
      3,
    );
    const markers = [];
    for (let i = 0; i <= 800; i++) {
      const t = i * 0.05;
      const marker = detector.observe({
        t,
        landmarks: makeDemoHand(getPhase(t).amount),
        tracking: true,
        confidence: 1,
      });
      if (marker) markers.push(marker);
    }
    expect(markers).toHaveLength(3);
    expect(markers[0].endMs).toBeGreaterThan(markers[0].peakMs);
    expect(new Set(markers.map((m) => m.id)).size).toBe(3);
  });
  it("does not turn an occlusion or a sudden opening into a completed cycle", () => {
    const detector = new RepetitionController(
      createDemoSession().calibration,
      3,
    );
    const outputs = [];
    for (let i = 0; i < 200; i++) {
      const t = i * 0.05;
      const tracking = t < 3 || t > 6;
      const marker = detector.observe({
        t,
        landmarks: tracking ? makeDemoHand(getPhase(t).amount) : [],
        tracking,
        confidence: 1,
      });
      if (marker) outputs.push(marker);
    }
    expect(outputs).toHaveLength(0);
  });
});
describe("post-session evaluation and real summaries", () => {
  it("uses actual measured peaks and timestamps, never a positive fallback result", () => {
    const sample = sampleCoachSession();
    const output = evaluateCompletedSession(
      sample.motionSession.frames,
      sample.motionSession.calibration,
      sample.repetitions,
      24000,
    );
    expect(output.metrics.assessedRepetitions).toBe(3);
    expect(output.metrics.pairs).toHaveLength(3);
    expect(output.metrics.targetAttainmentPercent).toBeGreaterThan(50);
    expect(output.metrics.targetAttainmentPercent).toBeLessThan(100);
    expect(output.events.length).toBeGreaterThan(0);
    expect(
      output.events.every((e) =>
        sample.motionSession.frames.some(
          (f) => Math.abs(f.t * 1000 - e.timestampMs) < 0.001,
        ),
      ),
    ).toBe(true);
    const absent = evaluateCompletedSession([], null, [], 0);
    expect(absent.metrics.targetAttainmentPercent).toBeNull();
    expect(absent.metrics.assessedRepetitions).toBe(0);
    expect(absent.events).toEqual([]);
    expect(structuredSummary(sample).completedRepetitions).toBe(
      sample.completedRepetitions,
    );
  });
  it("marks gaps as uncertain and excludes underobserved manual confirmations", () => {
    const sample = sampleCoachSession();
    const frames: HandFrame[] = sample.motionSession.frames.map((f) => ({
      ...f,
      tracking: f.t < 0.5,
    }));
    const output = evaluateCompletedSession(
      frames,
      sample.motionSession.calibration,
      sample.repetitions,
      24000,
    );
    expect(output.metrics.trackingQuality).toBe("insufficient");
    expect(output.metrics.assessedRepetitions).toBe(0);
    expect(output.metrics.targetAttainmentPercent).toBeNull();
  });
  it("compares only matching hand, reference, method, and provenance", () => {
    const earlier = sampleCoachSession();
    earlier.completedAt = "2026-10-01T12:00:00Z";
    const later = {
      ...sampleCoachSession(),
      completedAt: "2026-10-02T12:00:00Z",
    };
    expect(isComparable(earlier, later)).toBe(true);
    expect(isComparable(earlier, { ...later, hand: "Left" })).toBe(false);
    expect(isComparable(earlier, { ...later, source: "camera" })).toBe(false);
    expect(
      isComparable(earlier, { ...later, referenceVersion: "different" }),
    ).toBe(false);
    expect(
      addSessionComparison(later, [earlier]).metrics.comparison
        ?.previousSessionId,
    ).toBe(earlier.id);
    expect(generateLongitudinalSummary([earlier, later])).toContain("6 of 6");
  });
});
describe("bounded conversational bridge and reward callback", () => {
  const event = (
    sequence: number,
    type: "HAND_DETECTED" | "TRACKING_LOST",
    timestampMs: number,
  ): CoachingEvent => ({
    id: `event-${sequence}`,
    sequence,
    type,
    timestampMs,
    sessionId: "one",
    phase: "calibration",
    revision: 2,
  });
  it("drops duplicate, out-of-order, other-session and late-stage events; throttles tracking speech", () => {
    const bridge = new CoachingEventBridge("one");
    const a = event(1, "HAND_DETECTED", 1000);
    expect(bridge.accept(a, "calibration", 2)?.speak).toBe(true);
    expect(bridge.accept(a, "calibration", 2)).toBeNull();
    expect(
      bridge.accept(event(2, "TRACKING_LOST", 2000), "calibration", 2)?.speak,
    ).toBe(false);
    expect(
      bridge.accept(event(3, "HAND_DETECTED", 11000), "paused", 3),
    ).toBeNull();
    expect(
      bridge.accept(
        { ...event(4, "TRACKING_LOST", 12000), sessionId: "other" },
        "calibration",
        2,
      ),
    ).toBeNull();
    expect(
      bridge.accept(event(1, "TRACKING_LOST", 13000), "calibration", 2),
    ).toBeNull();
  });
  it("never overlaps speech, replays stale cues, or sends a raw landmark frame", () => {
    let time = 0;
    const port = { sendUserMessage: vi.fn(), sendContextualUpdate: vi.fn() };
    const queue = new ConversationCueQueue(port, () => time);
    queue.enqueue("Gently spread.", "guided_practice", 4);
    expect(queue.flush(true, true, "guided_practice", 4)).toBe(false);
    expect(queue.flush(false, false, "guided_practice", 4)).toBe(false);
    expect(queue.flush(true, false, "paused", 5)).toBe(false);
    expect(port.sendUserMessage).not.toHaveBeenCalled();
    queue.enqueue("We are paused.", "paused", 5);
    expect(queue.flush(true, false, "paused", 5)).toBe(true);
    expect(port.sendUserMessage).toHaveBeenCalledOnce();
    queue.enqueue("Old cue.", "paused", 5);
    time = 8000;
    expect(queue.flush(true, false, "paused", 5)).toBe(false);
  });
  it("deduplicates rewards, rejects samples and partial sessions, and retries failed delivery", async () => {
    const dispatcher = new GardenRewardDispatcher();
    const sample = sampleCoachSession(),
      callback = vi.fn();
    await dispatcher.deliver(sample, callback);
    expect(callback).not.toHaveBeenCalled();
    const session = { ...sample, source: "camera" as const };
    await dispatcher.deliver({ ...session, status: "partial" }, callback);
    expect(callback).not.toHaveBeenCalled();
    await Promise.all([
      dispatcher.deliver(session, callback),
      dispatcher.deliver(session, callback),
    ]);
    await dispatcher.deliver(session, callback);
    expect(callback).toHaveBeenCalledOnce();
    const retry = new GardenRewardDispatcher(),
      failure = vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue(undefined);
    await expect(retry.deliver(session, failure)).rejects.toThrow("offline");
    await expect(retry.deliver(session, failure)).resolves.toBe(true);
    expect(failure).toHaveBeenCalledTimes(2);
  });
});
