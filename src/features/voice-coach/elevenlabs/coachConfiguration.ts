import type { CoachPhase, VoiceConfiguration } from "../types/coach";
export const suppliedHackathonAgentId = "agent_7501m54dgcmbevh8z9ma1ft00khx";
export const defaultVoiceConfiguration: VoiceConfiguration = {
  agentId: import.meta.env.VITE_ELEVENLABS_AGENT_ID || suppliedHackathonAgentId,
  tokenEndpoint: import.meta.env.VITE_ELEVENLABS_TOKEN_ENDPOINT || undefined,
  connectionType: "webrtc",
};
export const phaseInstructions: Record<CoachPhase, string> = {
  idle: "Hi, I’m your ReMotion coach. We’ll gently spread and close your fingers, one step at a time.",
  permissions:
    "Enable your camera so the app can see your hand. Voice is optional. You can choose Guided Text Mode.",
  calibration:
    "Hold one hand comfortably in view. Capture fingers gently together, then your comfortable spread. Keep your palm facing the camera.",
  guided_demo:
    "Watch the movement. Start together, slowly spread, hold comfortably, then gently close. Stay within your own range.",
  guided_practice:
    "Let’s try one together. Start with your fingers comfortably together.",
  independent_intro:
    "Now try your planned repetitions on your own. Confirm the recording options, then tap Start my turn.",
  independent_recording:
    "Your turn. Spread and close at your own comfortable pace. I’ll stay quiet while you practice.",
  analyzing:
    "Your recording is complete. The app is checking the movement that was actually tracked.",
  results:
    "Here’s how your hand moved. You can read the summary and review your recording.",
  complete:
    "Thank you for practicing today. Your completed practice can now water your garden.",
  paused: "We’re paused. Take your time. Resume when you feel ready, or stop.",
  error: "Something needs attention. You can retry or return to the beginning.",
};
export const clientToolDefinitions = [
  {
    name: "getExerciseStatus",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "requestPause",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "requestResume",
    parameters: {
      type: "object",
      properties: { expectedRevision: { type: "integer" } },
      required: ["expectedRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "requestNextPhase",
    parameters: {
      type: "object",
      properties: {
        requestedPhase: {
          type: "string",
          enum: [
            "guided_demo",
            "guided_practice",
            "independent_intro",
            "independent_recording",
          ],
        },
        expectedRevision: { type: "integer" },
      },
      required: ["requestedPhase", "expectedRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "repeatInstruction",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];
