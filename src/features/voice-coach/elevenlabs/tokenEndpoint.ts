/** SERVER ONLY. Do not import this module into the browser entry. */
export interface TokenEndpointOptions {
  apiKey: string;
  agentId: string;
  allowedOrigin: string;
  authorize: (request: Request) => Promise<boolean>;
  rateLimit: (request: Request) => Promise<boolean>;
  fetcher?: typeof fetch;
}
export function createElevenLabsTokenEndpoint(options: TokenEndpointOptions) {
  return async (request: Request): Promise<Response> => {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    const reply = (error: string, status: number) =>
      new Response(JSON.stringify({ error }), { status, headers });
    if (request.method !== "POST") return reply("POST required.", 405);
    // Require same-origin caller intent as well as host-supplied authentication and rate limiting.
    if (request.headers.get("Origin") !== options.allowedOrigin)
      return reply("Origin not allowed.", 403);
    try {
      if (!(await options.authorize(request)))
        return reply("Authentication required.", 401);
      if (!(await options.rateLimit(request)))
        return reply("Too many requests.", 429);
    } catch {
      return reply("Voice authorization is temporarily unavailable.", 503);
    }
    if (!options.apiKey || !options.agentId)
      return reply("Voice authorization is not configured.", 503);
    try {
      const endpoint = new URL(
        "https://api.elevenlabs.io/v1/convai/conversation/token",
      );
      endpoint.searchParams.set("agent_id", options.agentId);
      const response = await (options.fetcher ?? fetch)(endpoint, {
        headers: { "xi-api-key": options.apiKey },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok)
        return reply("Voice provider authorization failed.", 502);
      const result: unknown = await response.json();
      if (
        typeof result !== "object" ||
        !result ||
        !("token" in result) ||
        typeof result.token !== "string"
      )
        return reply("Voice provider returned an invalid token.", 502);
      return new Response(JSON.stringify({ conversationToken: result.token }), {
        headers,
      });
    } catch {
      return reply("Voice provider is unavailable.", 502);
    }
  };
}
