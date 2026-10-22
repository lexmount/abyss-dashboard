import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConversationEntry,
  ConversationPreview,
  SegmentExchange,
  SegmentResponse,
  SessionHeaderResponse,
  SessionStreamsResponse,
  SessionTextSearchResponse,
} from "@/api/usage";
import { I18nProvider } from "@/contexts/i18n-context";
import SessionDetailPage from "./detail-page";

const mocks = vi.hoisted(() => ({
  fetchEventLocation: vi.fn(),
  fetchSessionHeader: vi.fn(),
  fetchSessionStreams: vi.fn(),
  fetchSessionSegment: vi.fn(),
  fetchEventConversation: vi.fn(),
  fetchUsageEvent: vi.fn(),
  searchWithinSession: vi.fn(),
}));

vi.mock("@/api/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/usage")>();
  return { ...actual, ...mocks };
});

vi.mock("@/components/layouts/base-layout", () => ({
  BaseLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const longText = `${"x".repeat(4000)}timeout${"y".repeat(993)}`;

// Segment a: one exchange whose request preview gives entries 0-2 of 5.
// Segment b: one exchange whose request text is cut to its first 2400.
const conversations: Record<string, ConversationEntry[]> = {
  r1: [
    { role: "system", text: "be brief" },
    { role: "user", text: "hello timeout" },
    { role: "assistant", text: "ok" },
    { role: "tool_call", name: "Bash", text: "sleep 1" },
    { role: "tool_result", text: "a timeout happened" },
  ],
  s1: [{ role: "assistant", text: "done" }],
  r2: [{ role: "user", text: longText }],
  s2: [{ role: "assistant", text: "fine" }],
};

const search: SessionTextSearchResponse = {
  query: "timeout",
  texts: [
    { id: 1, ranges: [[6, 13]] },
    { id: 2, ranges: [[2, 9]] },
    { id: 3, ranges: [[4000, 4007]] },
  ],
  hits: [
    {
      event_pk: "r1",
      entry_index: 1,
      field: "text",
      new: false,
      text_id: 1,
      segment: "a",
    },
    {
      event_pk: "r1",
      entry_index: 4,
      field: "text",
      new: true,
      text_id: 2,
      segment: "a",
    },
    {
      event_pk: "r2",
      entry_index: 0,
      field: "text",
      new: false,
      text_id: 3,
      segment: "b",
    },
    {
      event_pk: "x",
      entry_index: 0,
      field: "text",
      new: true,
      text_id: 1,
      segment: null,
    },
  ],
  truncated: false,
};

describe("SessionDetailPage search", () => {
  beforeEach(() => {
    window.localStorage.setItem("abyss-ui-language", "en");
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    mocks.fetchEventLocation.mockImplementation((eventPk: string) =>
      Promise.resolve({
        session_pk: "s-1",
        event_pk: eventPk,
        segment: eventPk.endsWith("2") ? "b" : "a",
        exchange: eventPk.endsWith("2") ? "b" : "a",
      }),
    );
    mocks.fetchSessionHeader.mockResolvedValue(header());
    mocks.fetchSessionStreams.mockResolvedValue(streams());
    mocks.fetchSessionSegment.mockImplementation((_session: string, head: string) =>
      Promise.resolve(segment(head)),
    );
    mocks.fetchEventConversation.mockImplementation((eventPk: string) =>
      Promise.resolve(whole(eventPk)),
    );
    mocks.fetchUsageEvent.mockReturnValue(new Promise(() => undefined));
    mocks.searchWithinSession.mockResolvedValue(search);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
  });

  it("steps through the backend's hits in page order, loading what the preview leaves out", async () => {
    renderPage("/sessions/s-1");
    expect(
      await screen.findByRole("heading", { level: 1, name: "First user request" }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "Search this session" }),
      "timeout",
    );

    // The first hit, in the context the request carried, is in the preview.
    expect(await screen.findByText("1 / 3")).toBeInTheDocument();
    expect(mocks.searchWithinSession).toHaveBeenCalledWith("s-1", "timeout", {
      signal: expect.any(AbortSignal),
    });
    const active = () => document.querySelector("[data-active-match]");
    await waitFor(() => expect(active()).toHaveTextContent("timeout"));
    expect(active()?.closest("[data-entry-index]")).toHaveAttribute(
      "data-entry-index",
      "1",
    );
    // Each segment counts its hits; the entries left out say they hold one.
    const timeline = screen.getByRole("listbox", { name: "Turn timeline" });
    expect(within(timeline).getByText("2 hits")).toBeInTheDocument();
    expect(within(timeline).getByText("1 hits")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "2 entries left out (1 matches), click to load",
      }),
    ).toBeInTheDocument();
    expect(mocks.fetchEventConversation).not.toHaveBeenCalled();

    // The next one is in an entry the preview leaves out.
    await user.click(screen.getByRole("button", { name: "Next match (Enter)" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    await waitFor(() =>
      expect(active()?.closest("[data-entry-index]")).toHaveAttribute(
        "data-entry-index",
        "4",
      ),
    );
    expect(mocks.fetchEventConversation).toHaveBeenCalledWith("r1");

    // The last one is in the other segment, past the start its text is cut to.
    await user.click(screen.getByRole("button", { name: "Next match (Enter)" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.fetchEventConversation).toHaveBeenCalledWith("r2"),
    );
    await waitFor(() => expect(active()).toHaveTextContent("timeout"));
    expect(screen.getByTestId("location")).toHaveTextContent("segment=b");
    expect(active()?.closest("article")).toHaveAttribute("data-event-id", "r2");
    expect(
      screen.getByRole("heading", { level: 1, name: "First user request" }),
    ).toBeInTheDocument();
  });

  it("opens a search carried over on its event's segment, without inspecting it", async () => {
    mocks.fetchSessionHeader.mockResolvedValue({ ...header(), title: null });
    renderPage("/sessions/s-1?event=r2&q=timeout");

    expect(await screen.findByText("3 / 3")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "session-1" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("?event=r2&q=timeout"),
    );
    await waitFor(() =>
      expect(
        document.querySelector("[data-active-match]")?.closest("article"),
      ).toHaveAttribute("data-event-id", "r2"),
    );
    expect(mocks.fetchUsageEvent).not.toHaveBeenCalled();
  });
  it("locates an event without a search and keeps its stable URL", async () => {
    renderPage("/sessions/s-1?event=s2");

    await waitFor(() =>
      expect(document.querySelector('article[data-event-id="s2"]')).toHaveAttribute(
        "data-selected",
        "true",
      ),
    );
    expect(mocks.fetchEventLocation).toHaveBeenCalledWith("s2");
    expect(mocks.fetchUsageEvent).not.toHaveBeenCalled();
    expect(mocks.searchWithinSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("?event=s2");
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
  });

  it("resolves an event's new segment even when its link carries the old segment", async () => {
    renderPage("/sessions/s-1?segment=a&event=r2");

    await waitFor(() =>
      expect(document.querySelector('article[data-event-id="r2"]')).toHaveAttribute(
        "data-selected",
        "true",
      ),
    );
    const timeline = screen.getByRole("listbox", { name: "Turn timeline" });
    expect(within(timeline).getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("location")).toHaveTextContent("event=r2");
  });

  it("keeps event location usable when the carried search has no matching hits", async () => {
    mocks.searchWithinSession.mockResolvedValue({ ...search, hits: [], texts: [] });
    renderPage("/sessions/s-1?event=r2&q=absent");

    await waitFor(() =>
      expect(document.querySelector('article[data-event-id="r2"]')).toHaveAttribute(
        "data-selected",
        "true",
      ),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("?event=r2&q=absent");
  });

  it("clears the event anchor on manual segment navigation", async () => {
    renderPage("/sessions/s-1?event=r2");
    await waitFor(() =>
      expect(document.querySelector('article[data-event-id="r2"]')).toBeInTheDocument(),
    );
    const timeline = screen.getByRole("listbox", { name: "Turn timeline" });
    await userEvent.click(within(timeline).getAllByRole("option")[0]);

    await waitFor(() =>
      expect(document.querySelector('article[data-event-id="r1"]')).toBeInTheDocument(),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("?segment=a");
    expect(screen.getByTestId("location")).not.toHaveTextContent("event=");
  });

  it("opens an inspector without changing the event anchor", async () => {
    renderPage("/sessions/s-1?event=s2");
    await waitFor(() =>
      expect(document.querySelector('article[data-event-id="s2"]')).toBeInTheDocument(),
    );
    const card = document.querySelector('article[data-event-id="s2"]') as HTMLElement;
    await userEvent.click(within(card).getByRole("button", { name: /Response/ }));
    await waitFor(() => expect(mocks.fetchUsageEvent).toHaveBeenCalledWith("s2"));
    expect(screen.getByTestId("location")).toHaveTextContent("?event=s2&inspect=s2");
    await userEvent.click(screen.getByRole("button", { name: "Close raw event" }));
    expect(screen.getByTestId("location")).toHaveTextContent("?event=s2");
    expect(screen.getByTestId("location")).not.toHaveTextContent("inspect=");
  });
});

function renderPage(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/sessions/:sessionPk"
              element={
                <>
                  <SessionDetailPage />
                  <Location />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

const tokens = {
  input: 1,
  output: 1,
  cache_read: 0,
  cache_write: 0,
  reasoning: 0,
  total: 2,
};

function header(): SessionHeaderResponse {
  return {
    session_pk: "s-1",
    session_id: "session-1",
    title: {
      event_pk: "r1",
      entry_index: 1,
      text: "First user request",
      length: "First user request".length,
    },
    agents: [{ name: "claude-code", version: null }],
    start: "2026-10-20T01:00:00Z",
    end: "2026-10-20T01:05:00Z",
    event_count: 4,
    exchange_count: 2,
    turn_count: 1,
    segment_count: 2,
    tokens,
    providers: ["anthropic"],
    models: ["claude-opus-4-5"],
  };
}

function streams(): SessionStreamsResponse {
  const base = {
    start: "2026-10-20T01:00:00Z",
    end: "2026-10-20T01:01:00Z",
    exchange_count: 1,
    label: null,
  };
  return {
    session_pk: "s-1",
    segments: [
      { ...base, head: "a", kind: "root", parent: null, forked_from: null },
      { ...base, head: "b", kind: "branch", parent: "a", forked_from: "a" },
    ],
  };
}

function segment(head: string): SegmentResponse {
  const n = head === "a" ? "1" : "2";
  const exchange: SegmentExchange = {
    id: head,
    request_pk: `r${n}`,
    response_pk: `s${n}`,
    base: null,
    base_segment: null,
    rule: null,
    no_base_reason: "first",
    new_from: 2,
    starts_turn: true,
    requested_at: "2026-10-20T01:00:00Z",
    responded_at: "2026-10-20T01:00:30Z",
    model: "claude-opus-4-5",
    request_tokens: tokens,
    response_tokens: tokens,
    request: preview(`r${n}`),
    response: preview(`s${n}`),
  };
  return { session_pk: "s-1", segment: head, exchanges: [exchange] };
}

/** The first three entries, each text cut to 2400 code units. */
function preview(eventPk: string): ConversationPreview {
  const entries = conversations[eventPk];
  return {
    ...whole(eventPk),
    chunks: [
      {
        from: 0,
        entries: entries.slice(0, 3).map((entry) =>
          (entry.text ?? "").length > 2400
            ? {
                ...entry,
                text: entry.text?.slice(0, 2400),
                text_length: entry.text?.length,
              }
            : entry,
        ),
      },
    ],
  };
}

function whole(eventPk: string): ConversationPreview {
  const entries = conversations[eventPk];
  return {
    event_pk: eventPk,
    completeness: "complete",
    entries_total: entries.length,
    chunks: [{ from: 0, entries }],
    omitted_entries: 0,
    omitted_bytes: 0,
    attachments: [],
  };
}
