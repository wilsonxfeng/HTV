# Full-body Echoes merge notes

Branch: `feature/full-body-echoes`, based on `59d6e7a` (`feature/tigerdata-backend`). No automatic merge or publication.

## Integration surfaces

- `App.tsx`: Practice now opens the configurable exercise chooser. Body sessions open `BodySessionReview`; hand sessions still open the existing Studio.
- `useHandTracker.ts`: delegates model creation/inference to the unified adapter. Existing hand identity, geometry, drawing and framing checks are retained.
- `VoiceCoach.tsx`: optional accepted-command text; the existing ElevenLabs provider and agent are unchanged.
- `capture.ts`: adds shared elapsed time and real pause/resume controls. Existing hand callers still use start/stop/finish.
- `MotionSession`/clinical contracts: additive body metadata; optional landmark visibility/presence and image baseline. Existing hand payloads remain valid.
- `analysis.ts`: dispatches pose sessions to body metrics. Hand analysis is unchanged. Progress finger charts exclude pose data. History labels/body review and the Garden completion predicate support body sessions.
- `MovementEchoes`/`EchoViewer`: reuse the renderer, cache decoder, phase mapping, ghost hit test and overlap chooser. Body mode selects fixed baseline alignment and body labels. `cacheLocally` is opt-in for local captured/demo data; remote patient recordings remain transient.
- `ClinicianDashboard`: category/exercise/side filtering and metric-specific charts. **Knee video demo** explicitly switches to a read-only local repository, separate from authenticated patient data.
- Backend validation/repository/reports: accept validated pose data, recompute deterministic metrics, write/read `pose_frames`, group comparable body results and summarize stored body metrics.

## Installation and migration

No new npm dependencies or credentials. Existing `npm install` copies MediaPipe WASM. Include the new Pose model and both supplied knee clips plus their prepared mask cache when merging. The model is about 9 MB; the source videos about 19 MB together. Prepared masks/metadata are about 4.7 MB.

Restart `npm run api:dev` after merging. Startup applies repeatable, additive migrations `003_body_exercises.sql` and `004_pose_timescale.sql`. Local demo PostgreSQL skips the Timescale-specific file. No hand table is renamed or dropped.

For a private cloud demo, explicitly run `npx tsx scripts/seed-body-demo.ts` against the configured API. It uploads the two supplied videos and verifies retrieval, then writes scoped access tokens to ignored `.evidence/body-demo-access.json` with private permissions. It does not modify the existing public synthetic demo patient. Do not commit the access file or environment files.

## Checks

Run:

```sh
npm test
npm run api:check
npm run build
npm run build:clinician
npm run build:echoes
```

There are no separate lint scripts in this repository. The TypeScript builds enforce strict types and unused imports/variables.

Results for this branch: 91 tests passed across 17 files; API type check and all three production build targets passed. `git diff --check` passed. See `FULL_BODY_ECHOES.md` for real-video, virtual-camera, database/R2 and Gemini evidence and limitations.

Manual regression: choose Finger Spread & Close, confirm its voice-led calibration still opens, then open the existing hand demo. Check Garden and History, body category filtering, original-video fallback, peak pause/scrub, click/chip focus switching, and phone layout.

For the final physical-camera acceptance test, record two seated knee sessions using the same camera and selected side. Confirm 33-point data, clock alignment, three detected or manually marked cycles, moving leg masks, and peak-synchronized switching. See `FULL_BODY_ECHOES.md` for completed evidence and explicit limits; supplied video and virtual camera checks do not constitute live-camera validation.

## Conflict and rollback notes

Most implementation lives in `src/features/body-*`. Reconcile the small App, VoiceCoach, history, shared types and dashboard edits with any concurrent UI work; do not replace those whole files. The existing Echoes renderer and backend are extended rather than forked.

Frontend rollback can return Practice and body dispatch to their prior routes. Additive database columns/tables can remain in place. Do not drop them or clear browser stores as part of a code rollback. No hand data migration is required.
