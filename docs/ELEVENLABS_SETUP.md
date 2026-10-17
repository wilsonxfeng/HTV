# ElevenLabs setup — ReMotion Coach

SDK checked: `@elevenlabs/react` **1.18.0**, including the installed declarations and official documentation. This version uses `ConversationProvider` and granular controls/status/mode/input/client-tool hooks. Legacy examples that call `useConversation` without a provider do not apply.

The public Agent ID provided for this feature is:

`agent_7501m54dgcmbevh8z9ma1ft00khx`

The app does not auto-connect. A user explicitly chooses **Connect voice coach**, after seeing the external-processing disclosure. That action requests microphone access through the SDK. Camera access is a separate explicit action. Mute and Disconnect are always available while connected. Disconnection does not stop tracking or corrupt recording; visible instructions and manual controls continue.

## Public hackathon mode

Use the supplied ID or set `VITE_ELEVENLABS_AGENT_ID` in a local environment file, using `.env.example` as the template. Public Agent IDs are not API secrets. Restrict permitted origins and usage in the ElevenLabs dashboard for deployment. The harness uses `http://127.0.0.1:5174`; add localhost/production origins as appropriate.

1. Open your existing agent in the ElevenLabs dashboard and name it **ReMotion Coach**.
2. Paste the full system prompt from `ELEVENLABS_AGENT_PROMPT.md`.
3. Set its first message to the supplied introduction.
4. Choose a calm English voice with clear pronunciation and moderately slow delivery. Listen to a sample with your actual demo device.
5. Create the five documented client tools. Their exact names, required fields, and response behavior must match the browser implementation.
6. Enable contextual updates/user text events supported by the SDK. Background updates alone do **not** ask the agent to speak. This module uses `sendUserMessage` for a bounded spoken cue and `sendContextualUpdate` for state/results.
7. Review provider audio/transcript retention, microphone consent, allowed origins, interruptions, turn timeout, and budget controls.
8. Test a short conversation, pause/stop requests, and a real exercise. Check that the agent stays quiet during independent practice.

The current supplied agent connected during browser testing and returned a generic “Hello! How can I help you today?” greeting. The feature supplies a runtime operating contract and stage-specific cues, but changing its durable first message, system prompt, voice, or dashboard tools requires access to your ElevenLabs account/API. No dashboard changes are claimed by this branch.

## Private authenticated mode

Set `VITE_ELEVENLABS_TOKEN_ENDPOINT=/api/voice-coach/token`. This takes precedence over the public ID. The frontend makes a same-origin POST and accepts:

```json
{ "conversationToken": "short-lived WebRTC token" }
```

or:

```json
{ "signedUrl": "wss://short-lived-signed-websocket-url" }
```

`src/features/voice-coach/elevenlabs/tokenEndpoint.ts` is an optional **server-only** Request/Response handler. It is not imported by the public browser entry. It can run in a serverless route or Worker. Example host wiring:

```ts
import { createElevenLabsTokenEndpoint } from "./tokenEndpoint";

export async function POST(request: Request) {
  return createElevenLabsTokenEndpoint({
    apiKey: process.env.ELEVENLABS_API_KEY!,
    agentId: process.env.ELEVENLABS_AGENT_ID!,
    allowedOrigin: "https://your-app.example",
    authorize: (request) => yourExistingSessionVerifier(request),
    rateLimit: (request) => yourServerRateLimiter(request),
  })(request);
}
```

The two authorization/rate-limit functions are required host dependencies. There is deliberately no allow-all default and no new authentication framework. Do not deploy an unauthenticated credential vending endpoint. Validate the host's session cookie and rate-limit before calling the provider. A cross-origin deployment needs an explicitly restricted CORS adapter; the included handler is same-origin only.

Store `ELEVENLABS_API_KEY` only in the server/Worker secret store. Never use a `VITE_` API-key variable or put a secret into `coachConfiguration.ts`. Responses are `no-store`, errors are sanitized, and provider requests have a timeout. The signed-URL path can be supplied by a host's existing backend; the included server handler generates WebRTC tokens.

## Tool configuration

`clientToolDefinitions` is exported from the feature and contains the exact JSON schemas. Configure client tools synchronously with **wait for response** enabled. Handlers return a string, normally JSON for status and a concise accepted/rejected result for mutations. The state machine rejects stale revisions and unsafe phase changes. A tool result never means the LLM has authority to invent movement evidence.

## Privacy

Local vision: webcam inference, landmark recordings, optional silent webcam video, evaluation, and IndexedDB storage.

External voice: live microphone audio, agent responses, transcripts as configured by the provider, and minimal app context (stage/revision, hand-presence boolean, configured repetition count, completed count, and a validated numerical result summary). Webcam frames, raw landmarks, medical history, filenames, and patient identifiers are not sent through app context. If a user speaks personal information, their microphone audio is still processed by the voice service; the UI does not promise otherwise.

## Official references checked

- https://elevenlabs.io/docs/eleven-agents/libraries/react
- https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools
- https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events
- https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token
