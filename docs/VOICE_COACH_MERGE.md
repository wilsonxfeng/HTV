# Voice coach merge handoff

## Identity and isolation

- Branch: `feature/elevenlabs-voice-coach`
- Exact base commit: `d194dd542d6215e82df4e70931619ebd41fd54eb`
- Worktree: `/Users/wilsonxfeng/.codex/worktrees/elevenlabs-voice-coach/HTV`
- Original working copy: `/Users/wilsonxfeng/Documents/Projects/HTV` on `main`; its uncommitted reference-video/UI changes were preserved.
- Implementation commit(s): resolve the exact committed hashes with `git log --oneline d194dd542d6215e82df4e70931619ebd41fd54eb..feature/elevenlabs-voice-coach`. The handoff response includes the final hash. A commit cannot embed its own hash inside a tracked document.
- No automatic merge, cherry-pick, push, PR creation, or UI-branch overwrite was performed.

## New dependencies

- Runtime: `@elevenlabs/react` 1.18.0 (React SDK and its WebRTC/client dependencies).
- Development only: `fake-indexeddb` 6.2.6 (actual IndexedDB behavior in tests).

Keep the teammate's package entries. Add these dependencies and the `dev:voice` / `build:voice` scripts, then regenerate the lockfile with npm if both branches changed it. Do not replace their entire package manifest/lockfile with this branch's version.

## File boundaries

All implementation, UI, tests, demo fixtures, scoped CSS, optional server handler, and the harness are new files under `src/features/voice-coach/`. Documentation is new under `docs/VOICE_COACH_INTEGRATION.md`, `docs/ELEVENLABS_SETUP.md`, `docs/ELEVENLABS_AGENT_PROMPT.md`, and this document. `.env.example` is new and contains a public Agent ID, never an API secret.

The only existing files modified are:

1. `package.json`: two dependencies and two harness scripts.
2. `package-lock.json`: generated dependency resolution.
3. `.gitignore`: ignore local environment files to prevent accidental secret commits.

**Do not overwrite** the teammate's `src/App.tsx`, route configuration, Home, Guided Exercise, Garden, Progress, Motion Studio, global CSS/Tailwind, shared stores, core MediaPipe, analysis, session types, or persistence modules. They were read but not changed by this feature. The original 3D Studio remains intact and visible in this branch's original app.

Expected conflicts are limited to dependency/script additions, `.gitignore` additions, or a pre-existing feature folder with the same name. The baseline intentionally does not include the uncommitted reference-video changes in the original working tree. Leave those with their owner; do not reset, stash, or cherry-pick them as part of this feature.

## Merge procedure for the integration engineer

Review this branch from its own worktree. Merge or cherry-pick its implementation commit(s) only after the UI branch is ready. Resolve shared package/ignore additions by combining them. Then perform the following small host integration edits yourself; this feature has not pre-emptively made them:

1. Add a route/page for `VoiceCoachExperience` using your existing routing convention.
2. Point your existing “Start Today’s Practice” action at that route.
3. Supply one `motionAdapter` and your existing calibration where applicable.
4. Connect `onSessionComplete` to existing session-history persistence, and enrich those cards with the stored voice measurements.
5. Connect `onGardenReward` to your existing garden action using the stable event ID as its idempotency key.
6. Embed `ClinicianSessionSummary` or `CoachSessionCard` in your redesigned Progress dashboard, with the local-preview privacy label retained.
7. Apply the optional CSS token overrides for your redesigned palette.
8. Deprioritize/hide the existing 3D navigation button in your new navigation component. Keep the Studio component, renderer, old sessions, and geometry exports in the codebase. Do not delete or rewrite them just to remove a nav item.

Exact imports:

```tsx
import {
  VoiceCoachExperience,
  useExistingMotionAdapter,
  createSessionPersistenceAdapter,
  enrichSessionEntries,
  recordingRepository,
  ClinicianSessionSummary,
  CoachSessionCard,
  RecordingPlayback,
} from "./features/voice-coach";
```

Mount contract:

```tsx
<VoiceCoachExperience
  motionAdapter={existingMotionAdapter}
  initialCalibration={sameHandPersonalCalibration}
  onSessionComplete={saveCompletedSession}
  onGardenReward={rewardExistingGardenIdempotently}
  onExit={returnToExistingGarden}
/>
```

These callback/adapter variable names belong to the host. The complete runnable example and exact adapter field contract are in `VOICE_COACH_INTEGRATION.md`.

## History and video compatibility

No migrations are required. Voice records/video use a separate IndexedDB. `createSessionPersistenceAdapter(existingSaveSession)` optionally stores the matching legacy landmark entry. `enrichSessionEntries` attaches the voice record by ID. Independent repetitions have variable timing, so **use `voiceCoach.metrics` for their cards**, rather than the old Studio evaluator's fixed-tempo hold assumptions.

`onDeleted` should delete a corresponding legacy entry if the host created one. `recordingRepository.delete(id)` removes the feature record and its silent video atomically. Recording and results remain fully local; the voice provider receives no video or raw landmark coordinates.

Garden callbacks are invoked only after a saved, assessable completed session is finished. Samples, partial sessions, and unassessable sessions do not receive a reward. The feature guards double taps and records successful delivery. The host must still persistently deduplicate the stable ID to handle a crash between its side effect and the feature's acknowledgement.

## ElevenLabs setup status

The supplied public Agent ID is wired: `agent_7501m54dgcmbevh8z9ma1ft00khx`. A real WebRTC connection and agent response were verified in Chrome using simulated microphone input. This does not verify conversational quality with a real person.

The agent's durable greeting was generic when first connected. The feature sends a runtime coaching contract, stage context and bounded spoken cues. An account owner must apply the provided system prompt, first message, voice properties, and five client tools in ElevenLabs to persist that configuration. No account/API credentials were supplied for those dashboard edits, and none were invented or committed.

Private connection support is implemented through a required-auth, required-rate-limit server-only token handler; production deployment of that endpoint is a host task. The feature never needs an API secret in the browser.

## Checks and evidence

- `npm test`: 45 passing tests across the original and new suites at this handoff checkpoint. Coverage includes legal/illegal state transitions, stale events, sustained repetition cycles, tracking loss/recovery, throttling, cue cancellation, safe stop/negation handling, SDK provider initialization, public/private connection options, video-only codecs/lifecycle, fresh timestamps, pause removal, recording/evaluation orchestration, partial recordings, restarts, quota fallback, persistence/deletion, deterministic summaries/comparisons, and reward deduplication.
- `npm run build`: original app production build and strict TypeScript pass.
- `npm run build:voice`: independent harness production build and strict TypeScript pass.
- Browser: real SDK public-agent connection/response; real MediaPipe initialization using a simulated camera; silent MediaRecorder video saved and replayed after page reload; no hand yielded zero repetitions and an unassessable result; replay output had zero audio tracks; sample/results fit a 390×844 viewport without horizontal overflow.
- Main worktree was not edited. `git diff --name-only <base>..HEAD` plus the final commit show the additive boundary.

The repository had no initialized no-mistakes gate. Its initialization changes shared Git remotes/hooks, so it was not performed while another engineer owns the main working copy. Validation used the direct test/build/browser checks above; no automated gate/remote CI pass is claimed.

## Explicitly unverified

- A real person's live 3–5 repetition exercise, including people with hand impairments.
- Human two-way spoken questions, pain/stop recognition accuracy, acoustics, and timing under the final durable agent configuration.
- ElevenLabs dashboard tool invocation and stored prompt/voice configuration, because account access was not available.
- Safari/iPhone hardware, codecs, permissions, memory pressure, interrupted calls, and large real-device video quotas. Codec support and failures are covered with executed mocks; Chromium video recording/replay was exercised.
- A deployed private endpoint with the host's actual authentication/rate limiter.
- The teammate's final garden/routing/history integration and real reward persistence across devices. Only the documented callback boundary is implemented and tested here.
- Clinical validity, neurological recovery, or medical correctness of a webcam measurement.

## Integrated test checklist

After merging, install packages and run `npm test`, `npm run build`, and `npm run build:voice`. Launch both `npm run dev` and `npm run dev:voice` to verify that the original app and isolated harness still work. Confirm one active tracker/camera, matched physical-hand calibration, explicit video consent, actual three-cycle completion, manual confirmation labeling, pause/stop/resume, voice failure with working text mode, saved video replay, timestamped annotation seeking, history enrichment, local deletion in both stores, and one idempotent garden transaction. Test actual target phones and the final agent before presenting the live demo.
