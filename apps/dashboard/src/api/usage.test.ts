import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDailyTokenUsage,
  fetchRawEvents,
  fetchSessionTimeline,
  fetchUsageSummary,
  searchSessions,
} from "@/api/usage";

describe("usage API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests summary rows with the table group-by dimensions by default", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      return Promise.resolve(jsonResponse({ rows: [], next_page_token: null }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchUsageSummary({
      agentName: "codex",
      eventType: "request",
    });

    const url = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/api/v1/agent-usage/summary");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.get("agent_name")).toBe("codex");
    expect(url.searchParams.get("event_type")).toBe("request");
    expect(url.searchParams.get("group_by")).toBe("agent,provider,model");
    expect(url.searchParams.get("limit")).toBe("500");
  });

  it("allows callers to request chart-specific group-by dimensions", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      return Promise.resolve(jsonResponse({ rows: [], next_page_token: null }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchUsageSummary({}, { groupBy: ["day"] });

    const url = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/api/v1/agent-usage/summary");
    expect(url.searchParams.get("group_by")).toBe("day");
    expect(url.searchParams.get("limit")).toBe("500");
  });

  it("requests daily token usage with token-only summary fields", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      return Promise.resolve(
        jsonResponse({
          rows: [{ day: "2026-07-01", input_tokens: 12, total_tokens: 34 }],
          next_page_token: null,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchDailyTokenUsage({ agentName: "codex" });

    const url = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/api/v1/agent-usage/summary");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.get("group_by")).toBe("day");
    expect(url.searchParams.get("fields")).toBe("token_usage");
    expect(url.searchParams.get("agent_name")).toBe("codex");
    expect(url.searchParams.has("user_filter")).toBe(false);
    expect(url.searchParams.has("limit")).toBe(false);
    expect(response.rows[0]).toEqual({
      day: "2026-07-01",
      input_tokens: 12,
      total_tokens: 34,
    });
  });

  it("requests raw events without product scope parameters", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      return Promise.resolve(jsonResponse({ events: [], next_page_token: null }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchRawEvents({ sessionId: "session-1" });

    const url = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/api/v1/agent-usage/events");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.get("session_id")).toBe("session-1");
    expect(url.searchParams.get("limit")).toBe("100");
  });

  it("requests a session timeline by session primary key", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      return Promise.resolve(
        jsonResponse({
          session: {
            session_pk: "session pk",
            user_id: "user-1",
            device_context_id: "device-1",
            agent_name: "codex",
            agent_version: null,
            session_id: "session-1",
            started_at: "2026-06-25T00:00:00Z",
            ended_at: null,
            metadata: {},
          },
          turns: [],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSessionTimeline("session pk");

    const url = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/api/v1/agent-usage/sessions/session%20pk");
  });

  it("builds the session search request from traditional search filters", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      return Promise.resolve(
        jsonResponse({
          query: "timeout",
          total_sessions: 0,
          page: 2,
          page_size: 20,
          has_more: false,
          items: [],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchSessions({
      q: " timeout ",
      from: "2026-08-01T00:00:00Z",
      agentName: "claude-code",
      provider: "anthropic",
      model: "claude-opus",
      eventType: "response",
      page: 2,
      pageSize: 20,
    });

    const url = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/api/v1/agent-usage/search");
    expect(url.searchParams.get("q")).toBe("timeout");
    expect(url.searchParams.get("from")).toBe("2026-08-01T00:00:00Z");
    expect(url.searchParams.get("agent_name")).toBe("claude-code");
    expect(url.searchParams.get("llm_provider")).toBe("anthropic");
    expect(url.searchParams.get("llm_model")).toBe("claude-opus");
    expect(url.searchParams.get("event_type")).toBe("response");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("20");
  });
});

function requestUrl(input: unknown): URL {
  if (typeof input !== "string") {
    throw new Error("expected fetch URL string");
  }
  return new URL(input, "http://127.0.0.1");
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
