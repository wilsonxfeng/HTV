# Ask ReMotion integration

Ask ReMotion is mounted by `MovementEchoes.tsx`, not on the Progress overview. Progress owns recording navigation and passes `searchPatientId` only to its authorized synced viewer. Local demo viewers receive no cloud search context. No new packages or database migrations are required.

## Scripted question

`src/features/ask-remotion/localSearch.ts` defines the exact demo question, its punctuation-insensitive matcher and the fixed reply. Both the typed question and suggestion route to the `greatest-finger` preset, bypassing Gemini. The chosen recording and its peak are computed from the data; neither an ID nor a measured number is invented.

For local footage, `searchRecordings` considers loaded compatible sessions only. It uses the existing `compatible` descriptor (exercise, side, view, analysis version, orientation, demonstration kind, and explicit grouping for demo hands with unconfirmed identity). At least 80% of the video clock must be covered by reliable adjacent tracked frames. Eligible repetitions are valid, non-static, have at least 80% coverage, finite peak values and timestamps within the actual video duration. Finger results use the greatest valid repetition's mean separation. The first/latest preset compares each session's representative peak. Knee range uses the observed valid-frame maximum minus minimum and has no exact event timestamp.

For authenticated synced history, the panel sends `POST /api/ask-remotion` through the existing repository. Both patient and clinician roles retain assigned-patient authorization. The server's query executor continues using parameterized SQL, persisted measurements, quality filters and calibration-compatible cohorts. Other typed questions use Gemini's strictly validated intent schema; no arbitrary SQL or model-authored measurements are accepted.

## Focus and playback

The panel calls the viewer's `openEvidence` callback automatically for playable results, including comparisons. Existing local videos are reused. Missing remote evidence is loaded through authorized detail/video endpoints, and remote comparisons use `fetchEchoSessions`. Loaded sessions are merged without remounting the renderer or resetting overlay settings.

`EvidenceFocus` retains session ID, repetition index, nullable video timestamp and a fresh token. The viewer selects the matching original video, chooses the correct repetition, seeks its original clock and pauses after metadata loads. Session aggregates open at the beginning. Repeating the question focuses and pauses the result again. Manual recording selection clears the automatic focus lock.

Account changes abort pending panel requests; navigation away unmounts the viewer and cancels its pending search. Aborted responses cannot replace the current evidence. Cloud images remain in memory; explicitly local demo caches may remain on this device.

## Client presentation

The fixed greatest-opening response is: “Absolutely! This session had the greatest recorded finger separation. I’ve brought it into focus for you.” It appears only after successful evidence navigation. No-data, unavailable video and playback-loading failures receive their own truthful messages.

The client displays no degree values, metric cards, tracking percentages, raw timestamps or extraction diagnostics. Other search responses also use short qualitative templates. Measurements remain internal for ranking and analysis and in existing exports/API responses. Progress retains the calendar and dated recordings; the 3D replay retains visual movement/reference layers and playback without its numeric analysis panels.

## Verification

The updated suite includes 159 passing tests covering deterministic local ranking, changed-data selection, static/low-quality/wrong-side rejection, unconfirmed demo identity, exact-question routing, request cancellation, automatic comparison navigation, repeat focusing, scoped remote history, exact video seek/pause and visual replay controls. Production app, Movement Echoes and voice builds and backend type checking are part of the verification workflow.

Browser verification on the actual supplied hand clips confirmed that the scripted local question selects `high ROM.mov`, pauses the actual video at its stored peak, shows the fixed reply and displays no degree metrics. The client remained within a phone-width viewport. A second browser check opened the earlier synced cloud fixture, asked the same scripted question, loaded the winning later fixture into the existing Echoes viewer and paused its R2 video at the stored peak, without numeric client readouts. A live human webcam and live voice conversation are separate rehearsal checks.

### Conversational Echoes chat

Typed questions in Echoes now use `POST /api/ask-remotion/chat`. The panel displays a conversation and sends the last 20 messages plus the current focus so follow-ups such as “show the earlier one” can resolve against the recording history. Questions submit with Enter; the panel has no suggestion buttons or submit button.

The server calls Gemini with structured output: a reply and up to two recording/repetition selections. It validates selected IDs, repetition indices, timestamps, and comparison configurations before navigation. Synced histories require the existing patient authorization and use persisted session facts, ignoring browser-supplied measurements. Browser-only previews send compact metadata and movement measurements, without video or landmark frames, and are supported only by the explicit local demo/preview API configuration. `GEMINI_API_KEY` and `GEMINI_MODEL` remain server-side. Missing configuration or provider failures appear as chat errors.
