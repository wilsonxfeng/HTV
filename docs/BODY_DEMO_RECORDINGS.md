# Leg-extension and bicep-curl recordings

The October 18 replacement set contains three leg-extension clips and three bicep-curl clips from `public/demo recordings`. The filenames retain the supplied “leg curl” wording; the app uses the correct seated knee-extension exercise. Names identify footage, not measurements or recovery.

Open **Progress → On this device → Movement Echoes**. Opening local Echoes loads the current six prepared recordings and removes only the two retired supplied knee-demo IDs. Other local recordings and hand demos stay available. The preparation manifest and every outline are checked against the video's SHA-256 and processing version.

## Timing controls

- **Compare repetition** selects Rep 1 or Rep 2 across compatible recordings.
- Each overlay also has its own rep selector, allowing, for example, the second focused rep against the first rep in another recording.
- Playback supports 1×, 0.5×, and 0.25×, a movement-phase scrubber, replay, and pause at peak.
- Tracked movement phase maps use the actual joint excursion on either side of the peak. A hold stays at the same phase instead of letting other recordings move ahead. Rest between reps is outside the selected complete cycle.
- Recordings remain aligned at the fixed recorded torso/pelvis baseline. Limbs are not warped and missing masks are not drawn in.

Measured source-video times (seconds; sampled at 12 Hz):

| Recording | Rep 1 start / peak / end | Rep 2 start / peak / end |
|---|---|---|
| Leg extension · Low | 1.50 / 2.33 / 3.50 | 4.92 / 6.00 / 6.58 |
| Leg extension · Medium | 1.33 / 3.58 / 4.67 | 5.92 / 6.75 / 7.83 |
| Leg extension · High | 0.00 / 2.00 / 2.58 (return only) | 4.00 / 4.92 / 5.92 |
| Bicep curl · Low | 0.83 / 1.92 / 3.00 | 4.75 / 6.08 / 6.83 |
| Bicep curl · Medium | 0.50 / 1.33 / 2.67 | 4.25 / 5.58 / 6.42 |
| Bicep curl · High | 0.75 / 2.67 / 3.58 | 4.83 / 6.67 / 7.75 |

The high leg clip begins already extended. Its first outward movement is absent, so Rep 1 is explicitly **return only** and opens at the recorded peak. When used as an overlay, it stays hidden during the unavailable outward phase. The complete second rep is preferred by default. Live exercise counting and completion still require complete cycles.

All 612 sampled tracking frames passed the selected-limb visibility checks. Of 384 prepared person masks (32 per rep), 382 passed; the two unreliable masks in the high leg clip's second rep remain hidden. The leg footage tracks the right side in side view; the curls track the left side in front view. Comparison cohorts keep these viewpoints and exercises separate.

## Rebuild

1. Run `npm run dev` and open `http://localhost:5173`.
2. In a second terminal run `node scripts/prepare-body-demos.mjs`, a loopback-only artifact receiver restricted to that app origin.
3. In that page's developer console run:

   ```js
   const preparation = await import('/src/features/body-exercises/prepareBodyDemos.ts');
   await preparation.prepareBodyDemos(console.log, true);
   ```

4. Review the artifacts in `.evidence/body-v2/prepared`, then copy the manifest and its referenced WebP files into `public/demo recordings/body-prepared`. Remove only masks referenced by the superseded manifest. Stop the receiver after preparation.

Matching saved analyses can be reused; source hashes are verified before reuse. `scripts/seed-body-demo.ts` also understands all six catalog entries for an explicit private cloud upload. Loading local Echoes does not upload these clips.

Validation: production build, API type check, and 173 tests passed. Browser checks covered both exercise groups, shared/per-overlay rep selection, quarter-speed playback, original video timestamps, and real person overlays.
