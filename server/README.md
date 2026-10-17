# Clinician backend

Implementation lives on `feature/tigerdata-backend`. This is a hackathon prototype for consenting teammates and fictional patient information, not a production medical portal.

## Local demonstration

```sh
npm install
npm run api:demo:seed
# In a second terminal:
npm run dev
```

Open `http://localhost:5173/src/features/clinician/dashboard/index.html` and choose **Use local demo**. The demo API binds to loopback, creates a fictional patient, and stores data persistently in embedded PostgreSQL and private local video files under `.remotion-data/`. It does **not** connect to TigerData, R2, or S3. The optional seed uses FFmpeg to encode three labeled synthetic hand videos, with authored landmarks from the same frames and fictional session dates. These are pipeline fixtures, not camera observations or evidence of improvement. No AI summary is fabricated when a Gemini key is missing.

For subsequent runs use `npm run api:demo`. Do not start two API processes against the same embedded database directory. `.remotion-data/` and server source are denied by the Vite development server and excluded from Git. Delete `.remotion-data/` only when you intend to reset local demonstration data.

## TigerData, R2/S3, and Gemini

Copy `.env.server.example` to `.env.server` and configure the connection URL, bucket credentials, a random `AUTH_SECRET` of at least 32 characters, and optionally Gemini. Generate a secret locally with `openssl rand -hex 48`. Never put these values in a `VITE_` variable, browser code, screenshots, Git, or a chat message.

`npm run api:dev` requires cloud database and object-storage configuration; it never silently falls back to local storage. PostgreSQL TLS certificate verification is enforced. Startup applies the repeatable schema migration and the TimescaleDB hypertable migration. The configured TigerData role must be allowed to create/use the TimescaleDB extension and convert `hand_frames` to a hypertable. An existing hypertable is retained. In a deployed setup, run migrations as a dedicated migration role before starting application replicas.

The bucket must remain private. Configure its CORS policy using `server/r2-cors.json`, replacing the development origin with your HTTPS application origin. Also set `APP_ORIGIN`, `API_PUBLIC_URL`, and `VITE_API_BASE_URL` for that deployment. The API defaults to `127.0.0.1`; set `API_HOST` deliberately when deploying behind an HTTPS reverse proxy. Demo access is unavailable outside explicit nonproduction loopback mode.

Provision an assigned patient and clinician access token from the trusted server terminal:

```sh
npm run api:provision -- 'Consenting demo participant' clinician-demo '1,3,5' America/Toronto
```

The command prints scoped eight-hour bearer tokens. Deliver each token only to its intended demo user. Tokens are entered in the app and kept in tab session storage, never embedded in the client build. `npm run api:token -- clinician SUBJECT PATIENT_UUID` reissues access for an existing assignment. This is demo access provisioning, not an account system: there is no login, account recovery, immediate token revocation, audit trail, or production clinician identity verification. Do not expose the demo as a secure medical portal.

## Patient recording

In **Practice → Clinician sharing**, connect patient access, then explicitly consent to saving silent webcam video and hand data. Start the existing voice-led lesson. Calibration and progress still use the current coach and MediaPipe tracking; the recorder reuses that camera stream and excludes microphone audio.

At recording start the app assigns a UUID, a wall-clock start date, and one monotonic origin. Landmark timestamps are relative to that origin. `landmarkOffsetMs` records the difference between the landmark origin and the MediaRecorder start call, with `videoTime = landmarkTime + offset`. It is never inferred from wall-clock dates. MediaRecorder/browser scheduling still introduces small encoding-start uncertainty; this is not hardware frame synchronization. The same offset is used for detected cycles, flagged-moment seeking, and Movement Echoes. Mirroring changes only the preview; the stored pixels and image landmarks use the original encoding orientation.

On completion the app commits the video Blob, metadata, and landmarks to one IndexedDB outbox record **before** sending network requests. UUIDs and content hashes remain stable across retries and refresh. A failed upload preserves the local copy. Retry from the sharing panel, or reconnect to trigger pending uploads. Uploads use short-lived signed PUT URLs. Completion verifies uploaded bytes and metadata, copies the staging object to a finalized key, computes metrics/cycles on the server, and inserts frames, repetitions, and reports in one PostgreSQL transaction. Completed objects cannot be overwritten by an earlier upload URL. Repeated identical completion requests return the same record; conflicting data returns 409.

Local and cloud copies are separate. **Remove local copy** removes only the IndexedDB backup. Backend recordings are retained until removed administratively; lifecycle retention and remote deletion workflows are not implemented. Old landmark-only sessions do not acquire invented videos or automatically upload. Ordinary Practice remains landmark-only unless clinician sharing is connected and consented.

## Dashboard and Movement Echoes

The dashboard reads actual API records. It shows session count, latest practice, adherence to configured weekdays over the last 28 days, and the latest estimated index–middle hold angle. Missing schedules and insufficient tracking remain explicit. Charts use actual dates and separate different hands/calibrations. Detected cycles come from measured spread, not elapsed-time repetition counts or Gemini.

Session replay downloads the stored video through an authorized five-minute link. Cycle peaks and differences seek using the stored video/landmark clock offset. Select 2–4 compatible sessions to launch the existing Movement Echoes renderer. Its new `providedOnly` integration mode excludes unrelated browser clips, hides local import/delete/marker editing, and keeps extracted images in memory instead of IndexedDB. Closing the viewer releases that component’s video URLs and images.

Generate a grounded Gemini session summary from the dashboard, or use the report generated after a successful patient upload. Only deterministic metrics and comparable preceding sessions go to Gemini; videos, landmarks, names, and patient IDs are not sent. Structured output is schema-validated, and unsupported numeric/clinical assertions are rejected. AI text is still fallible and must be reviewed; original measurements remain authoritative. A provider error returns 503 without changing the recording. Print produces a browser print view with measurements and any generated report.

## Verification

```sh
npm test
npm run api:check
npm run build
npm run build:clinician
npm run build:echoes
```

API integration tests use actual embedded PostgreSQL, including transactions, joins, constraints, frame inserts and progress queries. They cover access denial, checksums, missing video, idempotent completion, clock mismatch, playback ranges and AI outage. They do not establish a real TigerData connection, execute its Timescale extension, upload to a real R2/S3 bucket, or invoke Gemini. Those live checks require your configured credentials. Browser checks should also cover consented hand capture on the actual device, encoding/microphone permissions, replay seek alignment, and a second device using the deployed API.

## API

All patient/session endpoints require a signed bearer token scoped to the patient. Upload endpoints also require the patient role. `GET /api/patients` returns only assigned patients. The spec’s eight session, video, progress and report endpoints are implemented. UUIDs, exercise identity, hand, dimensions, hashes, duration, normalized geometry, image bounds and increasing frame timestamps are validated. Client-supplied summaries or metrics are never accepted. `GET /api/health` reports backend readiness and configured providers without exposing credentials.

## Provider references

- [TigerData hypertables](https://www.tigerdata.com/docs/learn/hypertables/creating-and-configuring-hypertables)
- [R2 signed URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/latest-model)
- [ElevenLabs model settings](https://elevenlabs.io/docs/eleven-agents/customization/llm)

The client keeps the existing ElevenLabs agent. Selecting Gemini 3.8 Flash and controlling fallback models require the agent owner’s authenticated ElevenLabs dashboard; no agent settings are changed by this branch.
