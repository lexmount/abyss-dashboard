import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionStreamsLabels } from "./labels";
import {
  SessionStreamsView,
  type SessionStreamsViewProps,
} from "./session-streams-view";
import type {
  ConversationPreview,
  ConversationPreviewEntry,
  SegmentExchange,
  StreamSegment,
} from "./types";

const labels: SessionStreamsLabels = {
  summary: (segments) => `${segments} turns`,
  timeline: "Turn timeline",
  segmentNumber: (number) => `Turn ${number}`,
  segmentExchanges: (count) => `${count} exchanges`,
  segmentMatches: (count) => `${count} hits`,
  noUserInput: "No user input",
  continuesSegment: (number) => `Continues turn ${number}`,
  loading: "Loading session timeline...",
  noBase: (reason) => `no base: ${reason}`,
  after: (exchange, rule) => `after ${exchange} (${rule})`,
  request: "Request",
  response: "Response",
  requestMissing: "The request event is missing",
  responseMissing: "The response event is missing",
  noEntries: "No conversation entries",
  unknownModel: "Unknown model",
  tokens: "tokens",
  tokensUnavailable: "Token usage unavailable",
  inputTokens: "Input",
  outputTokens: "Output",
  cacheReadTokens: "Cache read",
  cacheWriteTokens: "Cache write",
  reasoningTokens: "Reasoning",
  incomplete: (completeness) => `Incomplete (${completeness})`,
  newPart: "New from here",
  loadingConversation: "Loading event content...",
  omitted: (count) => `${count} entries left out`,
  omittedMatches: (count, matches) =>
    `${count} entries left out (${matches} matches)`,
  loadError: (error) => `Failed: ${String(error)}`,
  showMore: "Show more",
  showLess: "Show less",
  characters: (count) => `${count} characters`,
  showRest: (count) => `Show all (${count} characters)`,
  input: "Input",
  output: "Result",
  noText: "No text",
  roleSystem: "System prompt",
  roleDeveloper: "Developer instructions",
  roleUser: "User input",
  roleAssistant: "Assistant reply",
  roleReasoning: "Reasoning",
  roleToolCall: "Tool call",
  roleToolResult: "Tool result",
  roleUnknown: "Unknown",
};

const conversations: Record<string, ConversationPreviewEntry[]> = {
  r1: [
    { role: "system", text: "be brief" },
    { role: "user", text: "hello" },
    { role: "assistant", text: "ok" },
    { role: "tool_call", name: "Bash", text: "sleep 1" },
    { role: "tool_result", text: "slept" },
  ],
  s1: [{ role: "assistant", text: "done" }],
};

const tokens = {
  input: 1,
  output: 1,
  cache_read: 0,
  cache_write: 0,
  reasoning: 0,
  total: 2,
};

const segments: StreamSegment[] = [
  {
    head: "a",
    kind: "root",
    parent: null,
    forked_from: null,
    start: "2026-10-20T01:00:00Z",
    end: "2026-10-20T01:01:00Z",
    exchange_count: 1,
    label: null,
  },
  {
    head: "b",
    kind: "branch",
    parent: "a",
    forked_from: "a",
    start: "2026-10-20T01:02:00Z",
    end: "2026-10-20T01:03:00Z",
    exchange_count: 1,
    label: null,
  },
];

const exchange: SegmentExchange = {
  id: "a",
  request_pk: "r1",
  response_pk: "s1",
  base: null,
  base_segment: null,
  rule: null,
  no_base_reason: "first",
  new_from: 1,
  starts_turn: true,
  requested_at: "2026-10-20T01:00:00Z",
  responded_at: "2026-10-20T01:00:30Z",
  model: "claude-opus-4-5",
  request_tokens: tokens,
  response_tokens: tokens,
  request: preview("r1"),
  response: preview("s1"),
};

/** The first three entries of an event. */
function preview(eventPk: string): ConversationPreview {
  return {
    ...whole(eventPk),
    chunks: [{ from: 0, entries: conversations[eventPk].slice(0, 3) }],
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
  };
}

function renderView(props: Partial<SessionStreamsViewProps> = {}) {
  const onSelectSegment = vi.fn();
  render(
    <SessionStreamsView
      segments={segments}
      segment="a"
      exchanges={{ status: "ready", segment: "a", exchanges: [exchange] }}
      onSelectSegment={onSelectSegment}
      formatTime={(value) => value.slice(11, 19)}
      formatDateTime={(value) => value}
      formatNumber={(value) => String(value)}
      labels={labels}
      {...props}
    />,
  );
  return { onSelectSegment };
}

const card = (eventPk: string) =>
  document.querySelector<HTMLElement>(`article[data-event-id="${eventPk}"]`)!;

describe("SessionStreamsView, read only", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the cards without any way to open an event", () => {
    renderView({
      loadConversation: vi.fn((eventPk: string) =>
        Promise.resolve(whole(eventPk)),
      ),
    });

    // The content is all there.
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
    expect(screen.getAllByText("2 tokens")).toHaveLength(2);

    // Neither the cards' headers nor their entries are controls.
    for (const eventPk of ["r1", "s1"]) {
      const article = card(eventPk);
      expect(
        within(article).queryByRole("button", { name: /Request|Response/ }),
      ).not.toBeInTheDocument();
      expect(
        article.querySelector("[data-card-header]")?.tagName.toLowerCase(),
      ).toBe("div");
      expect(article.querySelector("[aria-pressed]")).toBeNull();
      expect(article.querySelector('[role="button"]')).toBeNull();
      expect(article.querySelector("[tabindex]")).toBeNull();
      expect(article.querySelector(".cursor-pointer")).toBeNull();
    }
    expect(screen.queryByText(/raw event/i)).not.toBeInTheDocument();
  });

  it("still switches segments, expands entries, and loads what is left out", async () => {
    const loadConversation = vi.fn((eventPk: string) =>
      Promise.resolve(whole(eventPk)),
    );
    const { onSelectSegment } = renderView({ loadConversation });

    const timeline = screen.getByRole("listbox", { name: "Turn timeline" });
    fireEvent.click(within(timeline).getAllByRole("option")[1]);
    expect(onSelectSegment).toHaveBeenCalledWith("b");

    const system = card("r1").querySelector<HTMLElement>(
      '[data-entry-index="0"]',
    )!;
    fireEvent.click(within(system).getByRole("button", { name: "Show more" }));
    expect(within(system).getByText("be brief")).toBeInTheDocument();

    fireEvent.click(
      within(card("r1")).getByRole("button", { name: "2 entries left out" }),
    );
    expect(loadConversation).toHaveBeenCalledWith("r1");
    await waitFor(() =>
      expect(
        card("r1").querySelector('[data-entry-index="4"]'),
      ).toBeInTheDocument(),
    );
  });

  it("notes what is left out as text when the host cannot load it", () => {
    renderView();

    const leftOut = within(card("r1")).getByText("2 entries left out");
    expect(leftOut.tagName.toLowerCase()).toBe("p");
    expect(
      within(card("r1")).queryByRole("button", { name: /left out/ }),
    ).not.toBeInTheDocument();
  });
});

describe("SessionStreamsView, with events to open", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens an event from its card's header or an entry", () => {
    const onOpenEvent = vi.fn();
    renderView({ onOpenEvent, selectedEventId: "s1" });

    fireEvent.click(
      within(card("r1")).getByRole("button", { name: /Request/ }),
    );
    expect(onOpenEvent).toHaveBeenLastCalledWith("r1");

    const reply = card("s1").querySelector<HTMLElement>(
      '[data-entry-index="0"]',
    )!;
    expect(reply).toHaveAttribute("role", "button");
    expect(reply).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(reply);
    expect(onOpenEvent).toHaveBeenLastCalledWith("s1");
  });

  it("shows the inspector the host gives beside the cards", () => {
    renderView({
      onOpenEvent: vi.fn(),
      inspector: <aside aria-label="Raw event" />,
    });
    expect(
      screen.getByRole("complementary", { name: "Raw event" }),
    ).toBeInTheDocument();
  });

  it("shows the host's loading and error states for the segment", () => {
    renderView({ exchanges: { status: "loading" } });
    expect(screen.getByText("Loading session timeline...")).toBeInTheDocument();
    cleanup();
    renderView({ exchanges: { status: "error", message: "Gone" } });
    expect(screen.getByText("Gone")).toBeInTheDocument();
  });
});
