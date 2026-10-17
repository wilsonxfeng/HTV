# ReMotion voice coach integration

This feature is additive. The existing app, routes, tracker, analysis, history, stores, global styles, and 3D Studio are unchanged. Run the independent harness with `npm install` and `npm run dev:voice`, then open:

http://127.0.0.1:5174/src/features/voice-coach/harness/index.html

`npm run build:voice` builds the harness separately under `dist/voice-coach/`. `npm run build` still builds the original app. Run the main build first and the harness build second when you want both output directories retained. Install runs the existing postinstall to copy MediaPipe WASM assets; the original model under `public/models` is reused.

## Mounting

```tsx
import {
  VoiceCoachExperience,
  useExistingMotionAdapter,
  createSessionPersistenceAdapter,
  recordingRepository,
} from "./features/voice-coach";
import { saveSession } from "./lib/storage";

function CoachRoute() {
  const motion = useExistingMotionAdapter(); // one tracker, one camera
  return (
    <VoiceCoachExperience
      motionAdapter={motion}
      onSessionComplete={createSessionPersistenceAdapter(saveSession)}
      onGardenReward={async (event) => {
        // Invoke your EXISTING garden action. Persistently deduplicate event.id.
        await existingGardenAction(event.id, event.sessionId);
      }}
      onExit={() => navigateToExistingGarden()}
    />
  );
}
```

The `existingGardenAction` and `navigateToExistingGarden` names are integration placeholders, not new feature APIs. This branch intentionally does not implement a garden or change its state.

If the redesigned page already owns a tracker, **do not call `useExistingMotionAdapter` a second time**. Pass its existing instance using `MotionAdapter` instead:

```ts
type MotionAdapter = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  start(): Promise<void>;
  stop(): void;
  getSample(): MotionSample | null;
  getStream(): MediaStream | null;
  getStatus(): { status: string; error?: string };
  lockIdentity?(modelLabel: string | null): void;
};
```

`observedAt` must be a monotonic `performance.now()` timestamp of the actual inference input frame, **not** wall-clock time, a render timestamp, or video `currentTime`. Landmarks must be the existing palm-normalized 21-point array; retain raw world/image coordinates when available. The adapter reads the existing video `srcObject` to reuse the stream. Starting must reject if permission/model initialization fails. Stopping releases the adapter's camera. The silent video recorder owns cloned video tracks; stopping it does not stop the tracker's original stream or the voice microphone.

## Calibration and recording

Pass an existing `initialCalibration` from the same selected hand when appropriate. Otherwise the module captures steady neutral and comfortable-spread poses using existing geometry. A clinician-provided calibration is accepted through the same prop. If unavailable, users can explicitly acknowledge reference limitations and manually confirm repetitions; the module does not invent opening-goal scores without calibration.

The physical hand is explicitly selected by the user. Preview and overlay are mirrored together only in CSS. Model handedness is provenance, not the source of the selected hand identity. Each calibrated target needs at least one non-thumb pair with a measured change of 2° or more. These thresholds are engineering heuristics, not clinical cutoffs.

The app owns phases and counts. Default plan is 3; 4 or 5 are explicit user selections. Detection requires sustained closed → open → closed movement with hysteresis. Tracking gaps invalidate a pending cycle. Manual confirmation requires at least eight tracked samples and 1.5 seconds since the previous repetition; it is explicitly labeled and is not proof of a correct movement. No extra repetitions are automatically prescribed or rewarded.

Independent recording starts only after recording consent and a three-second countdown. Video is a separate opt-in. Both recording kinds use measured browser-clock timestamps. Paused time is removed from both the replay and landmark timeline, with discontinuities retained. MediaRecorder start events establish the common origin; final metadata includes the start latency and pause intervals. Browser encoding and scheduling introduce small timing uncertainty; this is not a hardware-synchronized motion laboratory.

Landmark/video capture is capped at three active minutes. Silent video is capped at approximately 60 MB. If MediaRecorder or a codec is unavailable, landmarks continue. Quota errors attempt to save measurements without the video; total storage failures leave the in-memory result available for export/retry.

## Persistence and history

The separate `remotion-voice-coach-v1` IndexedDB contains `sessions` and `videos`. It does not migrate, clear, or rewrite `remotion-local`. Each completed/partial record preserves its original `motionSession`, detected/manual repetition markers, analysis version, reference signature, status, timestamped differences, and deterministic summary.

`onSessionComplete(record)` is invoked after the feature repository successfully saves. It should be idempotent by record ID. If the callback fails, Save retries it using the same ID. The optional `createSessionPersistenceAdapter(saveSession)` writes a compatible landmark entry into the existing history database. Both entries use the same ID.

**Important:** the legacy `analyzeSession` assumes a fixed guided tempo. Independent repetitions have variable timing. When enriching a history card, prefer the stored `record.metrics` via `enrichSessionEntries(entries)` and the drop-in `CoachSessionCard`. Do not recalculate voice-session metrics with the old fixed-tempo evaluator. Legacy 3D replay remains available for landmarks but its fixed timeline/evaluation should be labeled as limited for independent recordings.

Host integration can delete both systems without modifying either implementation:

```ts
await recordingRepository.delete(id); // removes feature record AND silent video
await existingDeleteSession(id); // optional matching legacy history entry
```

The local clinician component deletes the feature record/video; the host's `onDeleted` callback should also remove its matching legacy entry if one was created. The default `recordingRepository` offers save/list/get/getVideo/delete; `getVideo(recordingId)` returns a Blob for `RecordingPlayback`.

## Results and clinician preview

Public components: `CoachSessionResults`, `RecordingPlayback`, `CoachInsightsPanel`, `CoachSessionCard`, `ClinicianSessionSummary`. Mount them inside `.vc-experience` (or supply the same scoped tokens) for standalone styling. `ClinicianSessionSummary` takes `sessions`, optional `repository`, and `onDeleted`. It is a **local demo**, not authenticated remote clinical access.

`generateLongitudinalSummary` includes only matching hand, exercise, reference signature, analysis method, and provenance. Samples and real recordings never mix. Peak opening varies by repetition; the evaluator uses a short neighborhood of observed frames, excludes insufficient temporal coverage, and reports missing values as null. Thresholds and percentages are descriptive; no clinical diagnosis or recovery claim is generated.

`printSessionReport` opens the native print dialog with a text-safe print surface. `exportVideo` downloads a user-requested copy of the silent recording. No automatic sharing occurs.

## Garden completion

`onGardenReward` receives `{ id, sessionId, completedRepetitions, source }`. Samples, partial recordings and unassessable recordings are rejected. Repeated Finish taps are guarded, and successful delivery is persisted in the feature record. The stable event ID is `remotion-coach-completion:<sessionId>`.

The host must deduplicate this ID in its existing reward store. No browser callback can guarantee exactly-once delivery across a crash between an external side effect and a local acknowledgement. Using the event ID as the garden transaction key closes that gap. Failed callbacks leave Finish available for retry.

## Scoped design tokens

```css
.your-coach-container {
  --coach-background: #faf7ef;
  --coach-text: #293e33;
  --coach-primary: #456b51;
  --coach-sage: #dce8d7;
  --coach-pink: #f1dcd7;
  --coach-surface: #fffdf8;
  --coach-border: #d7decf;
  --coach-button-text: #fffdf5;
}
```

Feature styles are scoped; no Tailwind/theme/global app file is changed. The harness has its own tiny document reset. Controls have large touch targets, visible keyboard focus, captions, and reduced-motion support.

## Verification

Run `npm test`, `npm run build`, and `npm run build:voice`. See `VOICE_COACH_MERGE.md` for final evidence and known limits. Do not merge the feature's sample patient data into real clinical histories or treat this local preview as secure remote access.
