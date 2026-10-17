# Full-body Movement Echoes

Branch: `feature/full-body-echoes`. Extends the existing recorder, voice coach, storage contracts and single-video Echoes renderer.

## Try it

1. Open Practice and choose **Seated Knee Extension**. Start the voice lesson or use the manual camera/recording controls. Choose the prescribed side and repetition count (three by default).
2. Sit in a stable chair with the camera approximately side-on. Keep the selected shoulder, hip, knee and whole foot visible. Begin from the resting position. Follow the prescribed range; stop if uncomfortable.
3. Record, pause/resume if needed, and finish. The app also finishes after the requested number of detected complete cycles. Repeat once with the same side and camera placement.
4. Open either saved recording. Choose **Overlay Sessions**, play or scrub, **Pause at peak movement**, then click an outline or date chip. Focus changes to that recording's original video at the same movement phase.
5. For the supplied footage: **Practice → Watch knee video demo**, or **Clinician dashboard → Knee video demo**. The dashboard opens **Leg & Knee → Seated Knee Extension**; select both recordings and Compare.

The knee demo uses the two supplied `leg curl … ROM.mov` recordings. Filenames are not measurement labels. These are consenting team videos, not a patient recovery history. Each supplied clip contains one detected cycle. Imported demo footage does not earn Garden rewards.

## Tracking and measurement

`exerciseRegistry.ts` configures hand/pose selection, landmarks, camera view, instructions, repetition detector, alignment and metric labels. `trackingAdapter.ts` wraps both existing Hand Landmarker and new Pose Landmarker. Only the selected model runs for capture. The hand pipeline retains its identity, framing and geometry checks.

Body capture uses 33 image-space and estimated world-space points, including visibility/presence. Required joints must be within the image and have visibility ≥0.6; presence, when supplied, must be ≥0.5. Unavailable or stale observations remain gaps. Body previews, original video and landmarks all use unmirrored camera coordinates. The initial inference budget is 12 fps, adapting to measured CPU cost (roughly 5–15 fps); slow devices can fall below the target.

- **Knee extension:** estimated internal hip–knee–ankle angle, with a straight leg approaching 180°. Reports maximum angle, observed range, extension from baseline, time to peak and ankle displacement relative to the hip, normalized by baseline torso length.
- **Unweighted bicep curl:** flexion is `180° − shoulder–elbow–wrist angle`. The primary session metric is observed flexion range. Echoes separately labels the selected repetition's peak flexion. Elbow displacement is relative to the torso.
- **Seated trunk rotation:** experimental shoulder/hip yaw change is used only as an internal phase signal. No trunk rotation degrees or clinical range scores are exposed. Original video remains available when cycles cannot be measured.

The low → peak → low detector uses robust observed signal thresholds and a short causal median. A gap longer than 300 ms or an explicitly invalid observation resets the cycle. Partial movements and tiny excursions do not become repetitions. It measures observed cycles, not prescribed exercise correctness. Manual cycle markers are available for local recordings; they remain clearly labeled and do not overwrite server measurements or completion rewards.

## Video clock and persistence

`SessionVideoCapture` records video tracks from the existing camera stream, excluding microphone audio. `PoseRecorder` timestamps samples using the same monotonic origin. Actual `MediaRecorder.pause()` intervals are excluded from both video and landmark time. Pause boundaries add an invalid observation so a repetition cannot silently bridge the break. Hidden tabs pause capture; pain/stop replies pause movement and prevent that recording from counting as completed practice.

`videoTime = landmarkTime + landmarkOffsetMs`. Metadata records the real offset rather than inferring it from dates. Automatic capture ends near 90 seconds. The UI keeps manual start/pause/resume/finish controls and retries a failed local save.

Original video, metadata and pose frames are committed together to IndexedDB `remotion-body-recordings`. Normalized Echoes data and derived masks use the existing Echoes repository. Saved motion history opens body review instead of the hand 3D studio. Each completed body practice grows one Garden flower; duplicate saves and extra repetitions within that session earn no extra flower.

Clinician sharing requires the existing patient access and explicit sharing consent. The same durable outbox, signed uploads, original-video hash checks and completion API handle body recordings. Upload failures leave the local copy available for retry. History deletion removes the local body recording and its derived Echoes copy; a separately consented upload-outbox copy is managed in Clinician sharing, as before.

## Actual-person masks and alignment

Uses the **person confidence mask bundled with Google's Pose Landmarker Full model**, an equivalent verified person/background segmentation model. It applies alpha to the original decoded frame's RGB pixels; no anatomical meshes or invented limb pixels are generated.

For one selected repetition, preprocessing samples 32 phase positions and caches actual transparent cutouts. Playback only decodes cached images; it does not rerun the model. Required joint retention, mask area and edge contact checks reject unreliable outlines. Missing masks stay gaps.

The observed neutral hip/shoulder axis defines a fixed baseline coordinate frame. The renderer fits a single global similarity transform (translation, uniform scale, rotation) between baselines. It never registers the moving ankle or wrist, and never independently stretches a limb. Temporal alignment maps start → 0, measured peak → 0.5, return → 1. Switching focus preserves phase. Existing per-pixel hit testing and overlap chooser are reused.

Local recordings persist masks in IndexedDB. Authorized remote patient comparisons keep masks in memory only, preserving the existing privacy boundary. The explicitly selected local team demo may use prepared local caches. Demo caches are keyed to video hash, analysis/segmentation version, repetition, settings and baseline. Four-session comparison supports three historical ghosts; the two supplied knee clips demonstrate one historical ghost.

## Dashboard and backend

Categories: Hand & Fingers, Arm & Elbow, Leg & Knee, Core & Torso. Exercise and side filters apply to history and charts. Body chart groups additionally separate camera viewpoint and analysis version. Hand calibration grouping remains unchanged. Demo and personal recordings cannot be mixed in an overlay.

Additive migrations add `body_region`, `tracking_mode`, `camera_view`, `target_side`, `analysis_version`, `segmentation_cache_version` to sessions and a new `pose_frames` table. The cloud migration makes `pose_frames` a Timescale hypertable. `hand_frames` is unchanged. Videos remain in R2/S3.

The server validates 33-point body baselines/frames, exercise/side/version metadata, monotonic sample clocks and original-video identity. It recomputes body metrics and repetition markers deterministically. `BodyEchoAdapter` and the existing clinical `toEchoSession` normalize local and server recordings into the same player.

Gemini receives stored body metrics and tracking limitations, never camera pixels or a request to invent scores. ElevenLabs uses the existing agent and deterministic command handler. The model cannot start or complete a capture by announcing that it did so.

## Validation performed

- Automated tests cover joint-angle conventions, three cycles at different speeds, gaps/partial/noisy movements, fixed similarity alignment, unchanged RGB under masks, viewpoint/version separation, experimental trunk output, pause/video-clock offsets, microphone exclusion, strict schemas and PostgreSQL body round trips. Existing hand and API regressions remain included.
- Both supplied knee videos were processed in Chrome with the real Pose Landmarker: 82 and 81 samples, one detected cycle each, approximately 99% tracked time, maximum observed knee angles 124.7° and 150.5°. These are prototype estimates, not validated clinical measurements.
- All 32 phase samples per supplied clip passed person-mask checks (64 total). Visually inspected peak overlays show the two recorded leg positions without limb warping.
- In the real player, clicking the historical ghost ankle switched to the other original video with phase held at 0.5; play/pause and accessible session chips were exercised.
- Both source videos uploaded to the configured TigerData/R2 backend and were retrieved with all 33-point frames, one repetition and matching metrics. They belong to a separate scoped team-demo patient. Existing synthetic demo access is unchanged.
- Gemini generated a body report from the stored measurements. Private access tokens are saved only in ignored `.evidence/body-demo-access.json` by the explicit seed script.
- The full recorder UI was exercised twice with the supplied videos as a virtual camera. The first recording paused/resumed and saved one requested cycle; the second automatically completed three requested cycles. Video and landmark duration/offset matched exactly in both saved records (0 ms clock error). This is a virtual camera replay test, not a physical webcam test.
- Both newly recorded sessions survived a page refresh. Reopening History restored the original video and both comparison choices. Scrubbing to phase 0.25 and switching focus at phase 0.5 worked on the saved recordings.
- The unified hand adapter was checked on the existing real hand demo clip and returned one hand with 21 image and 21 world landmarks. Selecting Arm & Elbow in the knee demo removed the knee recordings and chart rather than mixing measures.
- Mobile Practice was checked at 390×844 with no horizontal overflow.

## Exact limits

- Physical webcam operation with a person in front of the device has **not** been validated in this run. Real supplied videos and a virtual camera replay are distinct from that test.
- Bicep angle calculation is tested mathematically; no supplied bicep video or live bicep capture was available. Trunk rotation remains experimental and reports video comparison only.
- Monocular world coordinates are estimates. Camera perspective, occlusion, loose clothing and depth errors affect angles. No clinical correctness, recovery score or prescribed target is inferred.
- Baseline registration assumes the camera and seated pelvis stay reasonably fixed. It cannot compensate for a large viewpoint change. Body capture currently records the configured side view (knee/curl) or front view (trunk); keep that view consistent.
- Person-mask edges can include background or lose thin/occluded regions. A passing mask-quality check is not anatomical validation. Whole-person overlays may be visually cluttered.
- Prepared demos contain one cycle each. Multi-cycle counting has deterministic tests; live performance depends on framing, tempo and confidence. Local manual markers are not synchronized back to the backend.
- Segmentation runs synchronously during preprocessing with yields between frames, so slow devices may briefly stutter. Decoding/caching up to four videos consumes browser memory/storage. Safari/other browser MediaRecorder behavior still needs device testing.
- Remote caches are intentionally not persisted. Source demo videos are bundled public assets and play muted; newly captured videos exclude microphone audio.

## Model provenance

- [MediaPipe Pose Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Pose Landmarker outputs and segmentation](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)
- [Image Segmenter for Web](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js)
- Exercise reference supplied in the request: [Flint Rehab stroke exercises](https://www.flintrehab.com/stroke-exercises/). Instructions describe supported seated movements; they are not a patient-specific prescription.

Model asset: `public/models/pose_landmarker_full.task`, downloaded from `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`.

SHA-256: `5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1`.
