import type { CoachPhase, CoachState } from "../types/coach";
export const initialCoachState = (repetitions: 3 | 4 | 5 = 3): CoachState => ({
  phase: "idle",
  revision: 0,
  resumePhase: null,
  cameraGranted: false,
  recordingConsent: false,
  tracking: false,
  reducedTrackingAcknowledged: false,
  calibrated: false,
  referenceLimitationsAcknowledged: false,
  plannedRepetitions: repetitions,
  completedRepetitions: 0,
  guidedComplete: false,
  error: null,
});
export type CoachAction =
  | {
      type:
        | "BEGIN"
        | "CAMERA_READY"
        | "CALIBRATED"
        | "GUIDED_DONE"
        | "PAUSE"
        | "RESUME"
        | "STOP"
        | "ANALYSIS_READY"
        | "FINISH"
        | "RESET";
    }
  | { type: "TRACKING"; value: boolean }
  | { type: "CONSENT"; value: boolean }
  | { type: "ACKNOWLEDGE_TRACKING" | "ACKNOWLEDGE_REFERENCE"; value: boolean }
  | { type: "PLAN"; value: 3 | 4 | 5 }
  | { type: "REPETITION"; count: number }
  | { type: "NEXT"; requestedPhase?: CoachPhase; expectedRevision?: number }
  | { type: "ERROR"; message: string };
const next: Partial<Record<CoachPhase, CoachPhase>> = {
  calibration: "guided_demo",
  guided_demo: "guided_practice",
  guided_practice: "independent_intro",
  independent_intro: "independent_recording",
};
const pausable: CoachPhase[] = [
  "calibration",
  "guided_demo",
  "guided_practice",
  "independent_intro",
  "independent_recording",
];
export function transitionCoach(
  state: CoachState,
  action: CoachAction,
): CoachState {
  const enter = (
    phase: CoachPhase,
    extra: Partial<CoachState> = {},
  ): CoachState => ({
    ...state,
    ...extra,
    phase,
    revision: state.revision + 1,
  });
  switch (action.type) {
    case "RESET":
      return {
        ...initialCoachState(state.plannedRepetitions),
        revision: state.revision + 1,
      };
    case "BEGIN":
      return state.phase === "idle" ? enter("permissions") : state;
    case "CAMERA_READY":
      return state.phase === "permissions"
        ? enter("calibration", { cameraGranted: true })
        : state;
    case "TRACKING":
      return state.tracking === action.value
        ? state
        : { ...state, tracking: action.value };
    case "CONSENT":
      return [
        "idle",
        "permissions",
        "calibration",
        "guided_demo",
        "guided_practice",
        "independent_intro",
      ].includes(state.phase)
        ? { ...state, recordingConsent: action.value }
        : state;
    case "ACKNOWLEDGE_TRACKING":
      return { ...state, reducedTrackingAcknowledged: action.value };
    case "ACKNOWLEDGE_REFERENCE":
      return { ...state, referenceLimitationsAcknowledged: action.value };
    case "PLAN":
      return [
        "idle",
        "permissions",
        "calibration",
        "guided_demo",
        "guided_practice",
        "independent_intro",
      ].includes(state.phase) && [3, 4, 5].includes(action.value)
        ? { ...state, plannedRepetitions: action.value }
        : state;
    case "CALIBRATED":
      return state.phase === "calibration" && state.tracking
        ? { ...state, calibrated: true }
        : state;
    case "GUIDED_DONE":
      return state.phase === "guided_practice"
        ? enter("independent_intro", { guidedComplete: true })
        : state;
    case "NEXT": {
      if (
        action.expectedRevision !== undefined &&
        action.expectedRevision !== state.revision
      )
        return state;
      const destination = next[state.phase];
      if (
        !destination ||
        (action.requestedPhase && action.requestedPhase !== destination)
      )
        return state;
      if (
        state.phase === "calibration" &&
        !state.calibrated &&
        !state.referenceLimitationsAcknowledged
      )
        return state;
      if (
        destination === "independent_recording" &&
        (!state.cameraGranted ||
          !state.recordingConsent ||
          (!state.tracking && !state.reducedTrackingAcknowledged) ||
          (!state.calibrated && !state.referenceLimitationsAcknowledged))
      )
        return state;
      return enter(destination, {
        guidedComplete:
          destination === "independent_intro" || state.guidedComplete,
      });
    }
    case "REPETITION":
      return state.phase === "independent_recording" &&
        action.count === state.completedRepetitions + 1 &&
        action.count <= state.plannedRepetitions
        ? { ...state, completedRepetitions: action.count }
        : state;
    case "PAUSE":
      return pausable.includes(state.phase)
        ? enter("paused", { resumePhase: state.phase })
        : state;
    case "RESUME":
      return state.phase === "paused" && state.resumePhase
        ? enter(state.resumePhase, { resumePhase: null })
        : state;
    case "STOP":
      return state.phase === "independent_recording" ||
        (state.phase === "paused" &&
          state.resumePhase === "independent_recording")
        ? enter("analyzing", { resumePhase: null })
        : ["idle", "results", "complete", "analyzing"].includes(state.phase)
          ? state
          : enter("idle", { resumePhase: null });
    case "ANALYSIS_READY":
      return state.phase === "analyzing" ? enter("results") : state;
    case "FINISH":
      return state.phase === "results" ? enter("complete") : state;
    case "ERROR":
      return enter("error", { error: action.message });
  }
}
