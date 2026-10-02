import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDayTokenUsage,
  fetchRawEvents,
  fetchSessionTimeline,
  fetchSessionTrajectory,
  fetchUsageEvent,
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

  it("sums one local day's usage from its own bounded summary", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      const row = {
        input_tokens: 1,
        output_tokens: 2,
        cache_read_tokens: 3,
        cache_write_tokens: 4,
        total_tokens: 10,
      };
      return Promise.resolve(jsonResponse({ rows: [row, row], next_page_token: null }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const row = await fetchDayTokenUsage(
      { agentName: "codex" },
      { day: "2026-07-02", from: "2026-07-02T07:00:00Z", to: "2026-07-02T16:00:00Z" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/api/v1/agent-usage/summary");
    expect(url.searchParams.get("group_by")).toBe("event_type");
    expect(url.searchParams.get("fields")).toBe("token_usage");
    expect(url.searchParams.get("agent_name")).toBe("codex");
    expect(url.searchParams.get("from")).toBe("2026-07-02T07:00:00Z");
    expect(url.searchParams.get("to")).toBe("2026-07-02T16:00:00Z");
    expect(row).toEqual({
      day: "2026-07-02",
      input_tokens: 2,
      output_tokens: 4,
      cache_read_tokens: 6,
      cache_write_tokens: 8,
      total_tokens: 20,
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

  it("repeats a filter key for each chosen value and skips blank ones", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      return Promise.resolve(jsonResponse({ events: [], next_page_token: null }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchRawEvents({
      agentName: ["claude-code", "codex"],
      sessionId: ["session-1", " "],
      provider: [],
      model: ["gpt-5", "claude-opus"],
    });

    const url = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(url.searchParams.getAll("agent_name")).toEqual(["claude-code", "codex"]);
    expect(url.searchParams.getAll("session_id")).toEqual(["session-1"]);
    expect(url.searchParams.has("llm_provider")).toBe(false);
    expect(url.searchParams.getAll("llm_model")).toEqual(["gpt-5", "claude-opus"]);
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

  it("requests a session trajectory and one event by primary key", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSessionTrajectory("session pk");
    await fetchUsageEvent("event pk");

    expect(requestUrl(fetchMock.mock.calls[0]?.[0]).pathname).toBe(
      "/api/v1/agent-usage/sessions/session%20pk/trajectory",
    );
    expect(requestUrl(fetchMock.mock.calls[1]?.[0]).pathname).toBe(
      "/api/v1/agent-usage/events/event%20pk",
    );
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
