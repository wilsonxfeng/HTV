import type { HookOptions } from "@elevenlabs/react";
import type { CoachPhase, VoiceConfiguration } from "../types/coach";
export async function resolveConnection(
  configuration: VoiceConfiguration,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<HookOptions> {
  if (configuration.tokenEndpoint) {
    const endpoint = new URL(
      configuration.tokenEndpoint,
      window.location.origin,
    );
    if (
      endpoint.origin !== window.location.origin &&
      endpoint.protocol !== "https:"
    )
      throw new Error("The token endpoint must use HTTPS.");
    const response = await fetcher(endpoint.href, {
      method: "POST",
      credentials:
        endpoint.origin === window.location.origin ? "same-origin" : "omit",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal,
    });
    if (!response.ok)
      throw new Error(
        "Voice authorization failed. You can continue in Guided Text Mode.",
      );
    const value: unknown = await response.json();
    if (typeof value !== "object" || !value)
      throw new Error("Invalid voice authorization response.");
    const token = value as Record<string, unknown>;
    if (
      typeof token.conversationToken === "string" &&
      token.conversationToken.length
    )
      return {
        conversationToken: token.conversationToken,
        connectionType: "webrtc",
      };
    if (
      typeof token.signedUrl === "string" &&
      /^wss:\/\//.test(token.signedUrl)
    )
      return { signedUrl: token.signedUrl, connectionType: "websocket" };
    throw new Error(
      "Voice authorization did not return a conversation token or secure signed URL.",
    );
  }
  if (!configuration.agentId?.trim())
    throw new Error("Voice is not configured. Guided Text Mode is ready.");
  return {
    agentId: configuration.agentId.trim(),
    connectionType: configuration.connectionType ?? "webrtc",
  };
}
export interface ConversationPort {
  sendContextualUpdate(text: string): void;
  sendUserMessage(text: string): void;
}
/** A single pending cue; never queues old exercise narration behind newer stages. */
export class ConversationCueQueue {
  private pending: {
    text: string;
    phase: CoachPhase;
    revision: number;
    expires: number;
  } | null = null;
  private lastSent = -Infinity;
  constructor(
    private port: ConversationPort,
    private now: () => number = () => performance.now(),
  ) {}
  cancel() {
    this.pending = null;
  }
  enqueue(text: string, phase: CoachPhase, revision: number) {
    this.pending = { text, phase, revision, expires: this.now() + 7000 };
  }
  flush(
    connected: boolean,
    speaking: boolean,
    phase: CoachPhase,
    revision: number,
  ): boolean {
    const cue = this.pending;
    if (!cue) return false;
    if (
      cue.expires < this.now() ||
      cue.phase !== phase ||
      cue.revision !== revision
    ) {
      this.cancel();
      return false;
    }
    if (!connected || speaking || this.now() - this.lastSent < 1800)
      return false;
    this.port.sendUserMessage(
      `Application coaching cue (not a patient statement). Current phase: ${phase}; revision: ${revision}. Say this briefly, without announcing a new stage or changing any count: ${cue.text}`,
    );
    this.lastSent = this.now();
    this.cancel();
    return true;
  }
}
