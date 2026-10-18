# ReMotion

A hand-movement visualization MVP with optional, consented clinician sharing. Record **Finger Spread & Close**, calibrate a comfortable reference, and replay estimated 3D landmarks alongside a reference ghost. This is a technology demonstration, not a validated clinical assessment or treatment.

See [backend setup and synced Progress history](server/README.md) for TigerData, R2/S3, Gemini, offline uploads, and the local synthetic demo. Live cloud verification requires configured credentials.

## Run

Node.js 22.12+ (or 20.19+) is required. Developed and checked with Node 24.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. The development server uses port 5173; free that port first if it is occupied. For a production build:

```sh
npm run build
npm run preview
```

The production preview is normally http://localhost:4173. Deploy `dist/` to any static HTTPS host. Camera access requires localhost or HTTPS. The camera and movement features need no backend or API key. Voice-led practice connects to the configured ElevenLabs agent.

```sh
npm test
```

## Try it

- **Explore a sample** opens a clearly labeled, synthetic 24-second session without camera permissions. Orbit the 3D hand, switch layers, scrub the timeline, select amber differences, change replay speed, or inspect the spread graph.
- **Practice** opens an exercise menu. Finger Spread & Close is the only available exercise. Definitions in `src/lib/exercises.ts` supply each listed exercise’s name, instructions, pace, repetitions, phase model, and target validation. New movement types also need corresponding analysis/replay support before release.
- **Start lesson** connects ElevenLabs, then opens the camera. The coach asks for your physical “left hand” or “right hand”; the model’s predicted hand never substitutes for that confirmation.
- Say **ready** to capture a stable neutral pose, then again at a comfortable spread. Captures require 1.2 seconds of continuously tracked, stable observations. Say **begin** after calibration to start the countdown and three repetitions.
- Say **6 seconds**, **8 seconds**, or **10 seconds** to choose your pace before practice. Say **stop** or **pause**, or use the visible Stop control, to end practice with its actual partial data. A voice disconnection also stops the camera and recording.
- After neutral capture, ask for **reference video** to reveal a local file picker in the coach panel. The browser derives an exemplar target from the clip; it is not a clinical standard. For prescribed adjacent finger-axis targets, reply **target angles 10 12 8**, replacing those numbers with clinician-provided degrees for index–middle, middle–ring, and ring–pinky. No default clinical target is invented.
- Captions and a typed-reply field provide access to the same coach-driven flow. Replies are deliberately explicit: ambiguous answers or “not ready” never advance a step. Say **retry camera** to reconnect or repeat, **recalibrate** to reset your hand/reference, and **see my movement** to open an eligible recording.
- **Analyze My Movement** opens the actual recording and saves its landmark data locally. The journal supports replay, export, deletion, and two-session comparisons. Samples remain labeled and only save when explicitly requested.

## Measurement model

MediaPipe Hand Landmarker 1.1.1 estimates 21 image landmarks and 21 world landmarks. The original image/world estimates are retained in recordings along with palm-normalized points. The wrist is the origin; an orthonormal palm basis removes rigid orientation and palm-width normalization removes uniform scale. This is a reconstructed landmark skeleton, not an anatomical scan.

Adjacent finger-axis separation uses the 3D MCP-to-tip directions (thumb: landmark 2 to 4). Values are estimated degrees, not clinical joint range of motion. The reference interpolates between the measured neutral and target poses at the instructed tempo; a timing difference is not necessarily a range limitation.

Measurements aggregate observed hold phases (45–65% of each cycle), requiring at least 50% observed temporal coverage in a hold. Personal target attainment for an eligible pair is `(observed − neutral) / (target − neutral)`, clamped to 0–100%. Targets less than 2° above neutral are excluded as insufficiently distinct. The total is the mean of eligible pair percentages. Overshoot can still appear as a difference event. Events are shown when the mean hold angle differs by at least 3°; these are demonstration thresholds, not clinical cutoffs.

Tracking coverage is observed contiguous time divided by recording duration, not model accuracy. Intervals longer than 200 ms and explicit lost-tracking frames are not bridged in replay or evaluation. `confidence` in the session format stores MediaPipe's handedness category score; it is not a landmark confidence or a clinical confidence measure. Motion recording uses fresh inference timestamps, not repeated samples presented as new measurements.

## Hand identity and mirroring

Input to MediaPipe is unmirrored. The video and overlay are mirrored together in CSS for the selfie view. Landmark arrays are never reversed based on predicted handedness. The user-selected and confirmed physical hand is the session identity; the model's label is retained separately as provenance and locked after neutral calibration to detect obvious hand changes.

A browser test on a known hand image verifies that the installed detector returns 21 image/world points and that horizontal flipping changes its category. This does not establish patient identity or validate the physical left/right convention for every webcam. Reconfirm the actual hand before each session. Palm-aligned playback uses a consistent canonical orientation rather than a literal camera view.

## Privacy and persistence

The model and WASM assets are served locally. Without clinician sharing, Practice stores landmarks only. Connected patient access and explicit consent also enable silent video capture, an IndexedDB backup, and video/hand-data uploads for clinician review. Movement Echoes separately stores imported or explicitly consented camera videos and extracted hand images locally; it does not upload them. IndexedDB (`remotion-local`) stores landmark coordinates, hand selection, calibration, timing, and session metadata on this browser/device. JSON exports contain the same information. Browser-data clearing removes saved sessions. Storage errors leave the session available for export.

The 7.5 MB hand-landmarker model is included at `public/models/hand_landmarker.task`. `npm install` copies the matching package WASM files into `public/mediapipe/`. The project-local npm cache avoids permission problems with an existing user-level cache and is ignored by Git. Garden art, camera models and WASM have no runtime CDN dependencies. Voice lessons use the ElevenLabs service only after the user starts a lesson.

## Stack and structure

- Vite, React 19, strict TypeScript, Tailwind CSS 4
- MediaPipe Tasks Vision for real local inference
- Three.js, React Three Fiber, drei for dimensional replay and orbit controls
- Zustand for app/session state; idb for IndexedDB
- Lucide icons; Vitest for geometry and evaluation tests

`src/components/ExerciseFlow.tsx` manages preparation, calibration, countdown and recording. `src/lib/useHandTracker.ts` owns model/camera lifecycle and accurate canvas overlays. `HandStage.tsx` renders the skeletons, vectors and floor. `Studio.tsx` combines replay and measurement inspection. Pure geometry and evaluation live in `src/lib/geometry.ts` and `analysis.ts`.

WebGL 2 is needed for 3D. A labeled 2D fallback preserves playback and measurements if unavailable. The app is mobile-first, with larger layouts for tablets and desktops. Main-thread CPU inference is capped to roughly 18 FPS; slower hardware may show lower coverage. A future worker implementation can improve responsiveness.

## Validation and limits

The strict production build and automated tests cover the implementation. Tests cover rigid-transform and scale invariance, depth preservation, pair angles, personalized and clinician targets, replay gaps, insufficient data, hold coverage, overshoot, synthetic session evaluation, per-session garden rewards, and reference-video extraction/cancellation. Browser checks cover real MediaPipe model initialization/inference, 3D rendering, replay, layer controls, local persistence and responsive layout. No automated test validates neurological recovery, clinical accuracy, or a person's real webcam exercise. A complete live-hand session must still be checked with a person and webcam before a live demo.

## Exercise context and assets

Written exercise resources were inspected:

- [Cambridge University Hospitals: active finger exercises](https://www.cuh.nhs.uk/patient-information/hand-therapy-active-finger-exercises/) describes slow finger abduction/adduction. Its suggested hold is longer than this configurable hackathon demo.
- [American Stroke Foundation: targeted hand exercises](https://afterstroke.org/targeted-hand-exercises-for-survivors-of-stroke-using-therapy-putty/) provides stroke-specific hand exercise context, including finger spreading; the putty activity itself is not implemented here.

The two supplied YouTube videos were not available for content inspection; no implementation claim relies on having watched them. Follow a clinician's prescribed range and stop if uncomfortable.

The model comes from [Google's MediaPipe model distribution](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task). See [Google's Hand Landmarker documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js) for package/model terms and behavior. Interface visuals use CSS, SVG, Three.js and locally bundled original generated garden artwork; there is no stock photography.


## Garden mobile interface

The Home, Practice, Garden and Progress tabs are designed for phone screens, with a warm cream/green palette and original local gouache artwork. Motion Studio still renders interactive estimated 3D landmarks. Measurement details are expandable, and Progress includes session history, comparison, exports synced history and hand/body overlays with Ask ReMotion inside Movement Echoes.

Garden growth is derived from completed camera recordings in the existing IndexedDB database. Each completed camera practice session grows one flower, including separate sessions on the same day. Samples, partial sessions and duplicate saves do not contribute. Extra repetitions within a session do not earn additional flowers. Rest days never remove flowers. Deleting the underlying recordings or clearing browser storage changes the derived garden. No schema migration is required; completed legacy recordings remain supported.

Reference-video import from the upstream coaching update is available while setting a target, after neutral calibration. The resulting video example is labeled distinctly in target review and replay. All video decoding and MediaPipe processing stay local.

See `ASSET_CREDITS.md` for generated artwork provenance and reviewed third-party alternatives.

## Voice-led lessons

Practice uses a user-started ElevenLabs voice coach as its main lesson interface. The public default agent is `agent_7501m54dgcmbevh8z9ma1ft00khx`; override it with `VITE_ELEVENLABS_AGENT_ID`. No secret API key belongs in a Vite environment variable. A private agent requires a server-issued conversation token; this prototype uses a public agent.

Microphone audio and compact lesson context are shared with ElevenLabs. Camera frames, landmark arrays, and history stay local. Leaving Practice ends the conversation through SDK cleanup. Voice disconnects stop captures/countdowns and preserve an active recording as a partial session.

The app supplies lesson cues to the agent and handles explicit user transcripts using `src/lib/coachLesson.ts`. AI replies never execute actions. Guards require the connected coach, confirmed physical hand, fresh hand tracking, and real calibration before recording. The agent receives application results and must never claim an unconfirmed capture succeeded. This transcript bridge works with the existing public agent without requiring dashboard client-tool configuration. It is an explicit-command prototype, not unrestricted natural-language action planning.

Unit and component tests cover reply parsing, negation/ambiguity, exercise definitions, measured calibration, spoken progression, countdown cancellation, and partial-session preservation when voice disconnects. A real person should still check speech recognition, end-to-end timing, and hand capture on their device.

SDK documentation: [ElevenLabs React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react)


## Movement Echoes

Progress → Movement Echoes opens real-video hand ghost comparison. The four supplied demonstration clips are bundled unchanged, with reviewed phase samples for quick local loading. Three clips animate through detected cycles; the low-range clip is an explicitly static pose. Imported or consented new videos and derived cutouts use a separate local database. There is no voice upload or garden reward side effect.

See [Movement Echoes](docs/MOVEMENT_ECHOES.md), [capture guide](docs/MOVEMENT_ECHOES_CAPTURE_GUIDE.md), and [merge handoff](docs/MOVEMENT_ECHOES_MERGE.md). `npm run dev:echoes` launches the independent harness; `npm run build:echoes` builds it.

See [Progress demo recording plan](docs/PROGRESS_DEMO_PLAN.md) for preparing searchable finger/knee recordings and presenting the live session.
