import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  ConversationProvider,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
  useConversationClientTool,
} from "@elevenlabs/react";
import { resolveConnection } from "./conversationAdapter";
import { createElevenLabsTokenEndpoint } from "./tokenEndpoint";
import { CoachSessionResults } from "../components/CoachSessionResults";
import { sampleCoachSession } from "../demo/sampleCoachSession";
import { reportText } from "../components/ClinicianSessionSummary";
import { parseSpokenControl } from "./spokenControls";

afterEach(() => vi.unstubAllGlobals());
describe("installed ElevenLabs SDK integration", () => {
  it("honors spoken stop and discomfort while leaving explicit negations alone", () => {
    expect(parseSpokenControl("Please stop the exercise now")).toBe("stop");
    expect(parseSpokenControl("My hand hurts")).toBe("stop");
    expect(parseSpokenControl("Can we pause?")).toBe("pause");
    expect(parseSpokenControl("I’m ready.")).toBe("resume");
    expect(parseSpokenControl("I have no pain")).toBeNull();
    expect(parseSpokenControl("Do not stop")).toBeNull();
  });
  it("initializes the actual provider and current granular hooks without microphone/network access", () => {
    function Probe() {
      const controls = useConversationControls(),
        input = useConversationInput(),
        mode = useConversationMode(),
        status = useConversationStatus();
      useConversationClientTool("getExerciseStatus", () => "idle");
      return (
        <div>
          {typeof controls.startSession} {typeof controls.sendContextualUpdate}{" "}
          {status.status} {String(input.isMuted)} {String(mode.isSpeaking)}
        </div>
      );
    }
    expect(
      renderToString(
        <ConversationProvider>
          <Probe />
        </ConversationProvider>,
      ),
    ).toContain("disconnected");
  });
  it("uses public Agent ID or secure token without ever putting an API key in SDK options", async () => {
    expect(await resolveConnection({ agentId: "public-agent" })).toEqual({
      agentId: "public-agent",
      connectionType: "webrtc",
    });
    vi.stubGlobal("window", { location: { origin: "https://example.test" } });
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ conversationToken: "short-lived-token" }),
          { headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    expect(
      await resolveConnection({ tokenEndpoint: "/api/voice/token" }, fetcher),
    ).toEqual({
      conversationToken: "short-lived-token",
      connectionType: "webrtc",
    });
    await expect(resolveConnection({})).rejects.toThrow("Guided Text Mode");
    await expect(
      resolveConnection(
        { tokenEndpoint: "/api/voice/token" },
        vi.fn(
          async () => new Response("", { status: 503 }),
        ) as unknown as typeof fetch,
      ),
    ).rejects.toThrow("Guided Text Mode");
  });
  it("prints and renders measured results from provided data with no fake positive score", () => {
    const sample = sampleCoachSession();
    const html = renderToString(<CoachSessionResults session={sample} />);
    expect(html).toContain("Illustrative sample");
    expect(html).toContain(sample.coachSummary.replace(/&/g, "&amp;"));
    const uncertain = {
      ...sample,
      metrics: { ...sample.metrics, targetAttainmentPercent: null },
      status: "unassessable" as const,
      completedRepetitions: 0,
      coachSummary: "No clear tracked opening was available.",
    };
    expect(
      renderToString(<CoachSessionResults session={uncertain} />),
    ).toContain("Not enough clear movement");
    expect(reportText(uncertain)).toContain(
      "Personal goal attainment: Unassessable",
    );
  });
});
describe("isolated server-only token handler", () => {
  const request = () =>
    new Request("https://app.test/api/token", {
      method: "POST",
      headers: { Origin: "https://app.test" },
    });
  it("requires authentication, trusted origin and host rate limiting", async () => {
    const upstream = vi.fn();
    const handler = createElevenLabsTokenEndpoint({
      apiKey: "server-secret",
      agentId: "agent",
      allowedOrigin: "https://app.test",
      authorize: async () => false,
      rateLimit: async () => true,
      fetcher: upstream,
    });
    expect((await handler(request())).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    expect(
      (
        await handler(
          new Request("https://app.test/api/token", {
            method: "POST",
            headers: { Origin: "https://wrong.test" },
          }),
        )
      ).status,
    ).toBe(403);
    const limited = createElevenLabsTokenEndpoint({
      apiKey: "secret",
      agentId: "agent",
      allowedOrigin: "https://app.test",
      authorize: async () => true,
      rateLimit: async () => false,
    });
    expect((await limited(request())).status).toBe(429);
  });
  it("keeps the secret server-side and returns only an expiring conversation credential", async () => {
    const upstream = vi.fn(
      async () => new Response(JSON.stringify({ token: "conversation-token" })),
    ) as unknown as typeof fetch;
    const handler = createElevenLabsTokenEndpoint({
      apiKey: "server-secret",
      agentId: "agent",
      allowedOrigin: "https://app.test",
      authorize: async () => true,
      rateLimit: async () => true,
      fetcher: upstream,
    });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversationToken: "conversation-token",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
