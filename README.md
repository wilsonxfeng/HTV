# ReMotion

A browser-local hand-movement visualization MVP. Record **Finger Spread & Close**, calibrate a comfortable reference, and replay estimated 3D landmarks alongside a reference ghost. This is a technology demonstration, not a validated clinical assessment or treatment.

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

The production preview is normally http://localhost:4173. Deploy `dist/` to any static HTTPS host. Camera access requires localhost or HTTPS. The camera and movement features need no backend or API key. Optional voice coaching connects to the configured ElevenLabs agent.

```sh
npm test
```

## Try it

- **Explore a sample** opens a clearly labeled, synthetic 24-second session without camera permissions. Orbit the 3D hand, switch layers, scrub the timeline, select amber differences, change replay speed, or inspect the spread graph.
- **Begin Exercise** opens webcam preparation. Enable the camera and explicitly confirm your physical left/right hand. Keep one whole hand visible, palm forward, fingers relatively straight.
- Capture a stable neutral pose, then a comfortable spread. Capture takes at least 1.2 seconds of stable, continuously tracked observations. Retry if tracking is interrupted.
- After neutral capture, you can choose a local MP4/MOV of a well-performed exercise. The browser samples it with the same local MediaPipe model, keeps only clear one-hand frames, and derives an exemplar neutral and widest-spread target from the lower and upper spread bands. The video is not stored or uploaded; only the aggregate landmarks and filename are kept. This is a reference exemplar, not a universal normal hand or clinical ground truth.
- If you cannot voluntarily spread your fingers, a clinician-provided target is needed. After measuring your real neutral pose, the clinician-target form accepts the three adjacent non-thumb finger-axis angles. No default target is invented.
- Choose a 6-, 8-, or 10-second cycle; follow three guided repetitions. Recording can be stopped early. Tracking gaps remain gaps; partial sessions may not have enough hold data for metrics.
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

The model and WASM assets are served locally. No webcam video or still images are stored or uploaded. IndexedDB (`remotion-local`) stores landmark coordinates, hand selection, calibration, timing, and session metadata on this browser/device. JSON exports contain the same information. Browser-data clearing removes saved sessions. Storage errors leave the session available for export.

The 7.5 MB hand-landmarker model is included at `public/models/hand_landmarker.task`. `npm install` copies the matching package WASM files into `public/mediapipe/`. The project-local npm cache avoids permission problems with an existing user-level cache and is ignored by Git. Garden art, camera models and WASM have no runtime CDN dependencies. Optional voice coaching uses the ElevenLabs service only after the user starts it.

## Stack and structure

- Vite, React 19, strict TypeScript, Tailwind CSS 4
- MediaPipe Tasks Vision for real local inference
- Three.js, React Three Fiber, drei for dimensional replay and orbit controls
- Zustand for app/session state; idb for IndexedDB
- Lucide icons; Vitest for geometry and evaluation tests

`src/components/ExerciseFlow.tsx` manages preparation, calibration, countdown and recording. `src/lib/useHandTracker.ts` owns model/camera lifecycle and accurate canvas overlays. `HandStage.tsx` renders the skeletons, vectors and floor. `Studio.tsx` combines replay and measurement inspection. Pure geometry and evaluation live in `src/lib/geometry.ts` and `analysis.ts`.

WebGL 2 is needed for 3D. A labeled 2D fallback preserves playback and measurements if unavailable. The app is mobile-first, with larger layouts for tablets and desktops. Main-thread CPU inference is capped to roughly 18 FPS; slower hardware may show lower coverage. A future worker implementation can improve responsiveness.

## Validation and limits

The strict production build and 26 tests pass. Tests cover rigid-transform and scale invariance, depth preservation, pair angles, personalized and clinician targets, replay gaps, insufficient data, hold coverage, overshoot, synthetic session evaluation, daily garden rewards, and reference-video extraction/cancellation. Browser checks cover real MediaPipe model initialization/inference, 3D rendering, replay, layer controls, local persistence and responsive layout. No automated test validates neurological recovery, clinical accuracy, or a person's real webcam exercise. A complete live-hand session must still be checked with a person and webcam before a live demo.

## Exercise context and assets

Written exercise resources were inspected:

- [Cambridge University Hospitals: active finger exercises](https://www.cuh.nhs.uk/patient-information/hand-therapy-active-finger-exercises/) describes slow finger abduction/adduction. Its suggested hold is longer than this configurable hackathon demo.
- [American Stroke Foundation: targeted hand exercises](https://afterstroke.org/targeted-hand-exercises-for-survivors-of-stroke-using-therapy-putty/) provides stroke-specific hand exercise context, including finger spreading; the putty activity itself is not implemented here.

The two supplied YouTube videos were not available for content inspection; no implementation claim relies on having watched them. Follow a clinician's prescribed range and stop if uncomfortable.

The model comes from [Google's MediaPipe model distribution](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task). See [Google's Hand Landmarker documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js) for package/model terms and behavior. Interface visuals use CSS, SVG, Three.js and locally bundled original generated garden artwork; there is no stock photography.


## Garden mobile interface

The Home, Practice, Garden and Progress tabs are designed for phone screens, with a warm cream/green palette and original local gouache artwork. Motion Studio still renders interactive estimated 3D landmarks. Measurement details are expandable, and Progress includes session history, comparison, exports and a local clinician preview.

Garden growth is derived from completed camera recordings in the existing IndexedDB database. One completed local calendar day supplies one watering; four practice days produce a flower. Samples and partial sessions do not contribute. Extra repetitions on the same day do not accelerate rewards. Rest days never remove flowers. Deleting the underlying recordings or clearing browser storage changes the derived garden. No schema migration is required; completed legacy recordings remain supported.

Reference-video import from the upstream coaching update is available while setting a target, after neutral calibration. The resulting video example is labeled distinctly in target review and replay. All video decoding and MediaPipe processing stay local.

See `ASSET_CREDITS.md` for generated artwork provenance and reviewed third-party alternatives.

## Optional voice coach

Practice includes an optional, user-started ElevenLabs voice coach. The public default agent is `agent_7501m54dgcmbevh8z9ma1ft00khx`; override it with `VITE_ELEVENLABS_AGENT_ID`. No secret API key belongs in a Vite environment variable. If the agent requires authentication, a server-issued conversation token is needed; this client-only prototype is configured for a public agent.

The coach requests microphone access only when started. Microphone audio and the current exercise step are shared with ElevenLabs; camera frames, landmark arrays and saved history are not sent. Mute, stop, connection error recovery and visible coach captions are provided. Leaving Practice ends the voice session through the SDK provider cleanup. Speech does not control calibration, recording or repetitions. This optional coach is the current integration checkpoint; the separate `feature/elevenlabs-voice-coach` implementation described in the merge handoff has not yet been supplied on the remote. Its variable-timing session evaluator, silent video recording, clinician summaries and persistent reward callbacks are not included in this checkpoint.

SDK documentation: https://elevenlabs.io/docs/eleven-agents/libraries/react
