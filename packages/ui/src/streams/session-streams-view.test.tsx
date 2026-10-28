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
  SessionTurn,
  StreamSegment,
} from "./types";

const labels: SessionStreamsLabels = {
  summary: (turns) => `${turns} turns`,
  timeline: "Turn timeline",
  turnNumber: (number) => `Turn ${number}`,
  noTurn: "No turn",
  segmentExchanges: (count) => `${count} exchanges`,
  segmentMatches: (count) => `${count} hits`,
  noUserInput: "No user input",
  newContext: "New context",
  mainLine: "Main line",
  subagent: "Subagent",
  sideRequests: (count) => `Side requests ×${count}`,
  loading: "Loading session timeline...",
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
  backToTop: "Back to top",
  loadingConversation: "Loading event content...",
  omitted: (count) => `${count} entries left out`,
  omittedMatches: (count, matches) =>
    `${count} entries left out (${matches} matches)`,
  loadError: (error) => `Failed: ${String(error)}`,
  showMore: "Show more",
  showLess: "Show less",
  characters: (count) => `${count} characters`,
  showRest: (count) => `Show all (${count} characters)`,
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
    turn_id: "turn-1",
    turn: 1,
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
    turn_id: "turn-2",
    turn: 2,
  },
];

/** A turn of one main line, with nothing else in it. */
function turnOf(
  turn: number,
  main: string[],
  more: Partial<SessionTurn> = {},
): SessionTurn {
  return {
    turn,
    turn_id: `turn-${turn}`,
    start: "2026-10-20T01:00:00Z",
    end: "2026-10-20T01:01:00Z",
    exchange_count: main.length,
    label: null,
    new_context: turn === 1,
    executors: [
      {
        subagent_id: null,
        parent_subagent_id: null,
        main,
        side: [],
        exchange_count: main.length,
        start: "2026-10-20T01:00:00Z",
      },
    ],
    ...more,
  };
}

const turns: SessionTurn[] = [turnOf(1, ["a"]), turnOf(2, ["b"])];

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
  turn_id: "turn-1",
  turn: 1,
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
      turns={turns}
      segment="a"
      exchanges={[
        {
          head: "a",
          state: { status: "ready", segment: "a", exchanges: [exchange] },
        },
      ]}
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

  it("splits a response's tokens in its header, not a request's", () => {
    renderView();
    const header = (eventPk: string) =>
      card(eventPk).querySelector<HTMLElement>("[data-card-header]")!;
    // The request's split is in the inspector's properties.
    expect(header("r1")).toHaveTextContent("2 tokens");
    expect(header("r1")).not.toHaveTextContent(/Input/);
    expect(header("s1")).toHaveTextContent(/Output 1/);
  });

  it("goes to the request's new part once what was left out is loaded", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return {
          top: this.hasAttribute("data-new-part") ? 900 : 0,
          bottom: 0,
        } as DOMRect;
      });
    renderView({
      loadConversation: (eventPk) => Promise.resolve(whole(eventPk)),
    });
    fireEvent.click(
      within(card("r1")).getByRole("button", { name: "2 entries left out" }),
    );
    // Below the search (44px) and a gap of 8px; the header has no height
    // here. The page eases there, and the new entries glow as it arrives.
    await waitFor(
      () =>
        expect(scrollTo).toHaveBeenLastCalledWith({
          top: 848,
          behavior: "instant",
        }),
      // The easing runs on animation frames, which a busy machine slows.
      { timeout: 3000 },
    );
    await waitFor(
      () =>
        expect(
          card("r1").querySelector('[data-entry-index="1"]'),
        ).toHaveAttribute("data-flash"),
      { timeout: 3000 },
    );
    expect(card("r1").querySelector('[data-entry-index="1"]')).toHaveAttribute(
      "data-flash",
    );
    expect(
      card("r1").querySelector('[data-entry-index="0"]'),
    ).not.toHaveAttribute("data-flash");
    rect.mockRestore();
    vi.unstubAllGlobals();
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
      exchanges: [
        {
          head: "a",
          state: {
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
        },
      ],
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

  it.each(roles)("shows %s text on one line, from its start", (role) => {
    const text = "opening\nsecond " + "x".repeat(2500) + " tail-marker";
    const entry = renderEntry({ role, text, text_length: 4000 });
    const line = entry.querySelector<HTMLElement>("[title]")!;
    expect(line.textContent?.startsWith("opening\nsecond x")).toBe(true);
    expect(entry.textContent).not.toContain("tail-marker");
    // The whole text is read in the inspector; the row has nothing to open.
    expect(within(entry).queryByRole("button")).not.toBeInTheDocument();
    expect(entry).toHaveTextContent("4000 characters");
  });

  it("marks the search's hits on an entry's line", () => {
    const entry = renderEntry(
      { role: "tool_result", text: "before needle after" },
      {
        search: {
          query: "needle",
          matches: new Map([
            ["r1", new Map([[0, { name: [], text: [[7, 13]] }]])],
          ]),
          segmentMatches: null,
          active: null,
          revealRequest: 0,
        },
      },
    );
    expect(within(entry).getByText("needle").tagName).toBe("MARK");
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
    // At the entry chosen.
    expect(onOpenEvent).toHaveBeenLastCalledWith("s1", 0);
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
    renderView({ exchanges: [{ head: "a", state: { status: "loading" } }] });
    expect(screen.getByText("Loading session timeline...")).toBeInTheDocument();
    cleanup();
    renderView({
      exchanges: [{ head: "a", state: { status: "error", message: "Gone" } }],
    });
    expect(screen.getByText("Gone")).toBeInTheDocument();
  });
});

describe("Back to top", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows once the page scrolls past the view, and scrolls back to the top", () => {
    let top = 120;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top }) as DOMRect,
    );
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    renderView();
    expect(screen.queryByRole("button", { name: "Back to top" })).toBeNull();

    top = -400;
    fireEvent.scroll(window);
    fireEvent.click(screen.getByRole("button", { name: "Back to top" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });

    top = 0;
    fireEvent.scroll(window);
    expect(screen.queryByRole("button", { name: "Back to top" })).toBeNull();
    vi.unstubAllGlobals();
  });
});
