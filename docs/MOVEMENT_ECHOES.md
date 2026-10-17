# Movement Echoes

Movement Echoes overlays transparent cutouts of **actual recorded hand pixels** on one original video. It lives under `src/features/movement-echoes/`, with a small entry point in Progress and Clinician preview. It does not replace Guided Practice or the 3D Studio.

## Open the demo

```sh
npm install
npm run dev
```

Open Progress → Movement Echoes → Prepare four demo clips → Overlay Week. Play, pause, scrub, tap a colored hand, or choose a recording chip. An overlapping tap opens a list of the actual intersected masks. “Full frame” switches off the shared hand-detail zoom.

The independent harness is available with:

```sh
npm run dev:echoes
# http://localhost:5174/src/features/movement-echoes/demo/index.html
npm run build:echoes
```

The four original MOV files remain unchanged in `public/demo recordings/`. These are team demonstration recordings, not a patient's longitudinal recovery. Their names are not treated as measurements or chronological improvement. Physical hand side is unconfirmed; only this visually reviewed same-hand demo group may compare without a confirmed side. Personal imports require a selected physical hand and matching encoded mirror orientation.

## Real-video preparation and provenance

The supplied videos were decoded locally and sampled at approximately 12 Hz using the existing local MediaPipe model. Image landmarks and world landmarks are retained with video-relative timestamps. One complete cycle was found in each of `low med ROM`, `high ROM`, and `higher ROM`.

`low ROM` did **not** produce a reliably distinct complete cycle. Its real midpoint cutout is a labeled static comparison pose. It remains still while the other clips animate, and focusing it pauses the comparison at the corresponding peak poses. It does not acquire a fabricated cycle or exercise reward. The original clip remains playable under “Original video and manual phase markers.” A user can explicitly add manual phase markers; those remain labeled manual.

The prepared bundle contains 32 phase samples per moving cycle and one static sample: **97 real cutouts**. It is stored in `public/demo recordings/prepared/`, with an algorithm version, source SHA-256 hashes, actual landmarks, measured repetition boundaries and per-frame quality metadata. Loading this bundle verifies the unchanged source video hashes. A missing/stale bundle falls back to actual local video inference and extraction. Cache configuration changes also cause local preprocessing.

Each cutout is created by classifying video pixels against colors learned from interior palm/finger observations. A conservative background sample uses only pixels outside the first tracked hand's padded box. Foreground difference rejects stable room/face background there. A palm-seeded connected component removes disconnected noise, a wrist plane trims the forearm, small enclosed compression defects are filled, and edges are feathered by one interior pixel. Open finger gaps are not morphologically closed. No bone strokes, generic hands, inferred contours, independent finger warps or generated footage are used.

Basic checks include palm retention, five fingertip neighborhoods, unexpected crop-edge leakage, mask area and abrupt area changes. These are **heuristics, not validated segmentation accuracy scores**. Failed masks are hidden; they are not drawn as accurate silhouettes. The extraction inspector shows actual transparent imagery and warnings. Color tolerance is adjustable. Similar backgrounds, contact/occlusion, motion blur or lighting changes can still defeat this method; use a plain contrasting backdrop for new captures.

## Timing, alignment and rendering

- Measured spread is the mean of the three adjacent non-thumb finger-axis angles in the existing 3D geometry. Complete cycles require sustained opening, a peak, closing and sufficient tracked observations. The representative cycle maximizes tracking coverage rather than spread.
- The focused video is the master clock. Start→peak maps to phase 0→0.5, and peak→end maps to 0.5→1 independently for each recording. Cached images preserve the source session's own finger pose at its phase. Missing tracking is not interpolated across intervals over 250 ms.
- Wrist, index MCP, middle MCP and pinky MCP fit an orientation-preserving least-squares 2D similarity. The whole cutout receives one translation, rotation and uniform scale. High residual error hides an unreliable alignment. Opposite hands, different exercises and different mirror metadata are excluded, without silently reflecting footage.
- One original video decoder drives the normal overlay view. Cropped WebP textures and alpha masks are decoded once, painted on a single canvas, and reused. No inference, segmentation or video seeking for ghosts occurs in the playback loop. The default limit is three ghosts, with a maximum of five; sustained slow paints reduce this to two. Rendering and playback pause while hidden.
- Hit testing inverts the exact draw transform and tests actual cached alpha. Date/name chips remain accessible alternatives. Switching focus preserves normalized phase for moving cycles. Static-pose switching is explicitly a paused comparison.
- The enlarged hand view applies the same optional global zoom to both video and canvas. It preserves their aspect ratio and registration. “Full frame” restores the entire original frame.
- The explicit original-video fallback replaces the overlay viewer with two real videos. It synchronizes complete cycles by phase, with periodic drift correction and appropriate per-phase playback rates. Static comparisons stay still. This fallback uses two decoders only while selected.

## Local data and API

```tsx
import { MovementEchoes } from './features/movement-echoes';

<MovementEchoes
  sessions={optionalEchoSessions}
  initialFocusedSessionId={optionalId}
  onClose={returnToProgress}
  onDeleted={deleteExplicitlyLinkedHostEntry}
/>;
```

Props `sessions` are initial `EchoSession` records, not landmark-only `MotionSession` records. The feature merges them with its own local repository on mount. A session includes an original video Blob, dimensions/duration, video-relative image/world observations, exercise/physical hand/mirror metadata, repetitions, a source fingerprint and a measured landmark/video start offset when applicable.

`importRecording(blob, metadata, onProgress, signal)` imports a real clip and infers its landmarks. `adaptMotionSession(legacySession, correspondingVideo, videoMetadata)` can pair an existing landmark session with its actual matching video; its `offsetMs` is **video time minus landmark time**. A legacy landmark-only recording cannot be converted into genuine video ghosts without that original video. The adapter never invents footage or uses the fixed-tempo Studio evaluator as a variable-time repetition detector.

`echoRepository` stores original recordings and derived caches in a separate IndexedDB database, `remotion-movement-echoes`. No old database or session schema is migrated. Cache identity includes session ID, source fingerprint, selected repetition/markers, algorithm version and segmentation settings. Refresh reuses caches. Rebuild clears only derived caches. Deleting a recording atomically removes its video, landmarks and all associated caches. The optional `onDeleted` callback is only for a host that explicitly linked the same ID. There is no garden reward connection, and demonstrations never enter the legacy practice history.

New camera capture asks for explicit local-video consent, uses supported MediaRecorder MIME detection, requests `audio:false`, stops after 90 seconds and stops its tracks on exit. Analysis runs on the finished encoded video, so its landmarks share that video's timeline. Imported videos are retained unchanged, including any original audio tracks, and are played muted. No recordings, images or coordinates are sent to ElevenLabs. Clearing browser data removes the feature's personal recordings and caches. Bundled demonstration files are public app assets and can be reimported.

## Validation

Executed on Chrome on macOS, including actual provided MOV decoding and actual local MediaPipe inference:

- `npm test`: 65 passing tests across existing regressions and phase/alignment/raster extraction/cache/provenance suites.
- `npm run build` and `npm run build:echoes`: strict TypeScript and production builds pass.
- All 97 prepared masks passed the basic checks; contact sheets were visually inspected for hand contours, finger gaps, retained fingertips and unrelated room/face pixels.
- Real overlay playback, paused scrub, peak shortcut, alpha single-hit selection, overlap selection, and ghost→original-video focus switching passed. Phase 0.27 stayed 0.27 across a moving-video switch.
- Six widths (320, 375, 390, 430, 768, 1440) had no horizontal page overflow. Main Progress entry/exit worked.
- The normal viewer used one video element, and no `getImageData` calls occurred during the measured ordinary playback interval. Closing returned tracked object URL count to zero.
- Four source recordings/caches and 97 frames persisted across reload. Deletion was exercised in isolated storage. SHA-256 fingerprints and original source sizes remained unchanged.
- Fast prepared-demo loading took 468 ms in one local desktop run; this is not a phone benchmark.
- The two-video fallback played, paused and tracked phases within 0.011 in the observed check, then released its extra decoder.
- A real browser MediaRecorder test on a clearly synthetic canvas stream produced a replayable 1.497-second VP9 WebM with zero audio tracks. Tracks ended, zero hand observations/repetitions were fabricated, and the untracked original remained viewable.

Evidence is included under `docs/movement-echoes-evidence/`. Synthetic unit/capture fixtures are explicitly distinguished from the real-video screenshots and cutouts.

Unverified: physical iPhone/Safari codecs and camera lifecycle, sustained mobile thermal/memory performance, a new person's real live-camera exercise, clinical validity, and segmentation across diverse uncontrolled lighting/backgrounds/skin tones. The original-video fallback and mask warnings are available when extraction is unreliable. No clinical recovery claim is made.
