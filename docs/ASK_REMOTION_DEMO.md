# Ask ReMotion rehearsal

Start the existing API and frontend (`npm run api:dev`, `npm run dev`); for fictional local data use the existing `npm run api:demo:seed` (ffmpeg required). Open Progress and connect synced history with the participant’s assigned patient token. Choose an authorized patient and the correct side. Use at least two completed, adequately tracked finger sessions with compatible calibration/viewpoint/version, and one knee-extension session if demonstrating knee range. No data means a truthful empty result.

## 30-second sequence

1. Ask **“Which session had the greatest recorded finger opening?”** or click **Greatest finger opening**. The button uses the deterministic preset and works without Gemini; typed questions require configured Gemini. Point to the named mean separation metric, actual date, repetition and value. The actual recording opens in Movement Echoes at its stored peak timestamp, paused.
2. Ask **“How has the patient’s finger opening changed since their first session?”** or click **First vs. latest finger opening**. Show the two evidence cards and measured difference. Click **Compare in Movement Echoes**, then **Overlay Sessions** to show recorded ghosts. Each session is represented by its greatest valid repetition peak, within a compatible cohort. Say “recorded difference,” not recovery or clinical improvement.
3. Optional: ask **“Show me the session with the smallest knee-extension range.”** or click **Smallest knee-extension range**. This queries knee range, never finger data. Explain that range is a whole-session measurement: no exact event timestamp is stored, so the original video opens paused at its beginning and the UI says the timestamp is unavailable.

## Useful extra questions

- “Show the latest finger-opening session.”
- “Which session had the greatest index–middle hold angle?” (session aggregate; timestamp unavailable)
- “Which session had the greatest recorded knee angle?” (maximum angle, distinct from range)
- “Compare the first and latest bicep-curl range.”

Questions such as “Is this patient recovering?” or “What treatment should they do?” are unsupported. If interpretation is unavailable, use one of the three suggested searches; the UI explicitly labels it a suggested deterministic query. Do not claim Gemini is active when using that fallback.

## Before presenting

Check patient/side, two compatible finger recordings, ≥80% tracking, playable signed video, Gemini model access if typing questions, and original recording decode. If the backend has only knee data, demonstrate knee range honestly; do not use mock finger answers. Existing local knee demo mode is separate from the authenticated shared-history search.

Close Movement Echoes to return to Progress. Search remains available while viewing echoes, and loaded recordings/overlay settings persist across searches. New searches cancel stale navigation.

Verification: 141 automated tests passed in the final full regression. Backend TypeScript and production app, clinician, Movement Echoes and voice builds passed. Real browser verification passed on existing team knee footage with a temporary embedded PostgreSQL API; live Gemini and remote TigerData/R2 were not exercised.

For the current filming checklist and live presentation order, see [Progress demo plan](PROGRESS_DEMO_PLAN.md).
