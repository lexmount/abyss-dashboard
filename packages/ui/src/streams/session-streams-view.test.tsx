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
  subagent: "Subagent",
  derived: "Derived",
  byTime: "by time",
  spawned: "Subagents spawned",
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
    subagent_id: null,
    attached_to: null,
    attached_by: null,
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
    subagent_id: null,
    attached_to: null,
    attached_by: null,
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
  subagent_id: null,
  parent_subagent_id: null,
  root_turn_id: null,
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

  it("still switches segments, shows short entries, and loads what is left out", async () => {
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
    expect(within(system).getByText("be brief")).toBeInTheDocument();
    expect(
      within(system).queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();

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

  it("still goes to the subagents a segment spawned", () => {
    const { onSelectSegment } = renderView({
      segments: [
        ...segments,
        {
          ...segments[0],
          head: "c",
          start: "2026-10-20T01:02:30Z",
          end: "2026-10-20T01:02:40Z",
          subagent_id: "agent-7",
          attached_to: "a",
          attached_by: "declared",
        },
      ],
    });

    // The subagent follows the turn it is attached to, one column out.
    const timeline = screen.getByRole("listbox", { name: "Turn timeline" });
    const options = within(timeline).getAllByRole("option");
    expect(options.map((option) => option.dataset.segment)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(options[1]).toHaveAttribute("data-column", "1");
    expect(within(options[1]).getByText("Derived")).toBeInTheDocument();
    expect(within(options[1]).getByText("agent-7")).toBeInTheDocument();

    const spawned = document.querySelector<HTMLElement>("[data-spawned]")!;
    expect(spawned).toHaveTextContent("Subagents spawned");
    // Turn 3 by its place in the session, though it shows second.
    fireEvent.click(
      within(spawned).getByRole("button", { name: "agent-7 · Turn 3" }),
    );
    expect(onSelectSegment).toHaveBeenCalledWith("c");
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

describe("Entry text folding, for every role", () => {
  afterEach(cleanup);

  const roles = [
    "system",
    "developer",
    "user",
    "assistant",
    "reasoning",
    "tool_call",
    "tool_result",
    "unknown",
  ];

  function renderEntry(
    entry: ConversationPreviewEntry,
    props: Partial<SessionStreamsViewProps> = {},
  ) {
    renderView({
      exchanges: {
        status: "ready",
        segment: "a",
        exchanges: [
          {
            ...exchange,
            request: {
              ...whole("r1"),
              entries_total: 1,
              chunks: [{ from: 0, entries: [entry] }],
            },
          },
        ],
      },
      ...props,
    });
    return card("r1").querySelector<HTMLElement>('[data-entry-index="0"]')!;
  }

  it.each(roles)("shows short %s text with its line breaks", (role) => {
    const text = "first line\nsecond line";
    const entry = renderEntry({ role, text });
    const body = within(entry).getByText("first line second line");
    expect(body.textContent).toBe(text);
    expect(entry.querySelector(".line-clamp-6")).toBeNull();
    expect(
      within(entry).queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();
  });

  it.each(roles)("previews and toggles long %s text", (role) => {
    for (const text of [
      "opening " + "x".repeat(2500) + " tail-marker",
      Array.from({ length: 9 }, (_, index) => `line ${index + 1}`).join("\n"),
    ]) {
      const entry = renderEntry({ role, text });
      const tail = text.endsWith("tail-marker") ? "tail-marker" : "line 9";
      expect(entry.textContent).toContain(text.slice(0, 7));
      expect(entry.textContent).not.toContain(tail);
      expect(entry.querySelector(".line-clamp-6")).not.toBeNull();
      fireEvent.click(within(entry).getByRole("button", { name: "Show more" }));
      expect(entry.textContent).toContain(tail);
      expect(entry.querySelector(".line-clamp-6")).toBeNull();
      const scrollBox = entry.querySelector("pre");
      if (scrollBox) scrollBox.scrollTop = 120;
      fireEvent.click(within(entry).getByRole("button", { name: "Show less" }));
      expect(entry.textContent).not.toContain(tail);
      if (scrollBox) expect(scrollBox.scrollTop).toBe(0);
      cleanup();
    }
  });

  it.each(roles)(
    "opens %s text when the search hits past the collapsed start",
    (role) => {
      const text = "x".repeat(2500) + "needle";
      const entry = renderEntry(
        { role, text },
        {
          search: {
            query: "needle",
            matches: new Map([
              ["r1", new Map([[0, { name: [], text: [[2500, 2506]] }]])],
            ]),
            segmentMatches: null,
            active: null,
            revealRequest: 0,
          },
        },
      );
      expect(within(entry).getByText("needle").tagName).toBe("MARK");
      expect(entry.querySelector(".line-clamp-6")).toBeNull();
      fireEvent.click(within(entry).getByRole("button", { name: "Show less" }));
      expect(within(entry).queryByText("needle")).not.toBeInTheDocument();
    },
  );

  it.each([60, 2400])(
    "loads a tool result from a %i-character preview without opening its inspector",
    async (previewLength) => {
      const text = "x".repeat(2500) + "loaded-tail";
      const onOpenEvent = vi.fn();
      const loadConversation = vi.fn(() =>
        Promise.resolve({
          ...whole("r1"),
          entries_total: 1,
          chunks: [{ from: 0, entries: [{ role: "tool_result", text }] }],
        }),
      );
      const entry = renderEntry(
        {
          role: "tool_result",
          text: text.slice(0, previewLength),
          text_length: text.length,
        },
        { loadConversation, onOpenEvent },
      );
      expect(loadConversation).not.toHaveBeenCalled();
      fireEvent.click(within(entry).getByRole("button", { name: "Show more" }));
      await waitFor(() => expect(entry.textContent).toContain("loaded-tail"));
      expect(loadConversation).toHaveBeenCalledExactlyOnceWith("r1");
      expect(onOpenEvent).not.toHaveBeenCalled();
    },
  );
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
