import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SessionTrajectory,
  trajectoryRows,
  trajectoryTurnSummaries,
  type SessionTrajectoryEvent,
  type SessionTrajectoryItem,
  type SessionTrajectoryLabels,
  type SessionTrajectoryProps,
} from "./session-trajectory";

const items: SessionTrajectoryItem[] = [
  item({ kind: "context", stream: 0, turn_index: 1, text: "system: prompt" }),
  item({ kind: "user", stream: 0, turn_index: 1, text: "list files" }),
  item({
    kind: "tool_call",
    stream: 0,
    turn_index: 1,
    name: "Bash",
    input: '{"command":"ls"}',
    output: "README.md",
    output_event_pk: "event-result",
  }),
  item({ kind: "user", stream: 1, turn_index: 1, text: "classifier input" }),
  item({ kind: "assistant", stream: 0, turn_index: 2, text: "Found README" }),
];

describe("session trajectory model", () => {
  it("summarizes each turn by its first input, reply, or tools", () => {
    const summaries = trajectoryTurnSummaries([
      ...items,
      item({ kind: "tool_call", stream: 0, turn_index: 3, name: "Read" }),
    ]);

    expect(
      summaries.map(({ turnIndex, summary, toolNames, toolCalls }) => ({
        turnIndex,
        summary,
        toolNames,
        toolCalls,
      })),
    ).toEqual([
      {
        turnIndex: 1,
        summary: "list files",
        toolNames: ["Bash"],
        toolCalls: 1,
      },
      { turnIndex: 2, summary: "Found README", toolNames: [], toolCalls: 0 },
      { turnIndex: 3, summary: null, toolNames: ["Read"], toolCalls: 1 },
    ]);
    expect(
      trajectoryRows(items, 2).map((row) =>
        row.kind === "turn"
          ? `turn-${row.turnIndex}`
          : row.kind === "event"
            ? row.event.event_type
            : row.item.kind,
      ),
    ).toEqual(["turn-2", "assistant"]);
  });

  it("keeps side requests inline and inserts turn headers", () => {
    const rows = trajectoryRows(items);

    expect(
      rows.map((row) =>
        row.kind === "turn"
          ? `turn-${row.turnIndex}`
          : row.kind === "event"
            ? row.event.event_type
            : row.item.kind,
      ),
    ).toEqual([
      "turn-1",
      "context",
      "user",
      "tool_call",
      "user",
      "turn-2",
      "assistant",
    ]);
  });
});

describe("SessionTrajectory", () => {
  it("shows each request and response model and usage before opening an event", () => {
    const onSelectEvent = vi.fn();
    const events = [
      usageEvent({
        event_pk: "request",
        input_tokens: 2,
        cache_read_tokens: 77000,
        cache_write_tokens: 400,
        total_tokens: 77402,
      }),
      usageEvent({
        event_pk: "response",
        event_type: "response",
        llm_model: "claude-sonnet-4",
        output_tokens: 150,
        reasoning_tokens: 40,
        total_tokens: 150,
        token_usage_estimated: true,
      }),
      usageEvent({ event_pk: "replay", token_usage_available: false }),
    ];
    renderTrajectory(
      onSelectEvent,
      null,
      vi.fn(),
      null,
      null,
      [
        item({
          kind: "context",
          stream: 0,
          turn_index: 1,
          event_pk: "request",
          text: "instructions",
        }),
        item({
          kind: "user",
          stream: 0,
          turn_index: 1,
          event_pk: "request",
          text: "hello",
        }),
        item({
          kind: "tool_call",
          stream: 0,
          turn_index: 1,
          event_pk: "response",
          name: "Read",
          input: "file",
          output: "result",
          output_event_pk: "replay",
        }),
      ],
      events,
    );

    const rows = document.querySelectorAll<HTMLElement>(
      "[data-trajectory-event]",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Request");
    expect(rows[0]).toHaveTextContent("gpt-5");
    expect(rows[0]).toHaveTextContent("77402 tokens");
    expect(rows[0]).toHaveTextContent("Input 77402");
    expect(rows[0]).toHaveTextContent("Cache read 77000");
    expect(rows[0]).toHaveTextContent("Cache write 400");
    expect(rows[1]).toHaveTextContent("Response");
    expect(rows[1]).toHaveTextContent("claude-sonnet-4");
    expect(rows[1]).toHaveTextContent("≈ 150 tokens");
    expect(rows[1]).toHaveTextContent("Output ≈ 150");
    expect(rows[1]).toHaveTextContent("Reasoning (included in output) ≈ 40");
    expect(rows[1]).toHaveTextContent("Estimated");
    expect(rows[2]).toHaveTextContent("Token usage unavailable");
    expect(onSelectEvent).not.toHaveBeenCalled();
    fireEvent.click(
      within(rows[2]!).getByRole("button", { name: /^Request.*gpt-5/ }),
    );
    expect(onSelectEvent).toHaveBeenCalledWith("replay");
  });

  it("retains turns with no content and displays reported zero usage and unknown models", () => {
    const events = [
      usageEvent({
        event_pk: "empty",
        turn_index: 3,
        event_type: "response",
        llm_model: "",
      }),
    ];
    renderTrajectory(vi.fn(), 3, vi.fn(), null, null, [], events);
    expect(content().getByText("Unknown model")).toBeInTheDocument();
    expect(content().getByText("0 tokens")).toBeInTheDocument();
    expect(content().getByText("Output 0")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Turn 3/ })).toHaveTextContent(
      "No new content",
    );
    expect(content().queryByText("Empty")).not.toBeInTheDocument();
    expect(trajectoryRows([], 2, events)).toEqual([]);
  });

  it("keeps context blocks under the event that supplied them", () => {
    renderTrajectory(
      vi.fn(),
      null,
      vi.fn(),
      null,
      null,
      [
        item({
          kind: "context",
          stream: 0,
          turn_index: 1,
          event_pk: "first",
          text: "first instructions",
        }),
        item({
          kind: "context",
          stream: 0,
          turn_index: 1,
          event_pk: "second",
          text: "second instructions",
        }),
      ],
      [usageEvent({ event_pk: "first" }), usageEvent({ event_pk: "second" })],
    );
    expect(content().getAllByText("Context")).toHaveLength(2);
  });

  it("groups content inside its request or response and links tool calls to the request carrying their results", async () => {
    const onSelectEvent = vi.fn();
    const source = [
      item({
        kind: "context",
        stream: 0,
        turn_index: 1,
        event_pk: "request",
        text: "system instructions",
      }),
      item({
        kind: "user",
        stream: 0,
        turn_index: 1,
        event_pk: "request",
        text: "read the file",
      }),
      item({
        kind: "assistant",
        stream: 0,
        turn_index: 1,
        event_pk: "response",
        text: "Reading now",
      }),
      item({
        kind: "tool_call",
        stream: 0,
        turn_index: 1,
        event_pk: "response",
        name: "Read",
        call_id: "call-1",
        input: "file.md",
        output: "unique result payload",
        output_event_pk: "next-request",
      }),
    ];
    const original = structuredClone(source);
    renderTrajectory(onSelectEvent, null, vi.fn(), null, null, source, [
      usageEvent({ event_pk: "request" }),
      usageEvent({ event_pk: "response", event_type: "response" }),
      usageEvent({ event_pk: "next-request", turn_index: 2 }),
    ]);
    const groups = [
      ...document.querySelectorAll<HTMLElement>("[data-trajectory-event]"),
    ];
    expect(groups.map((group) => group.tagName)).toEqual([
      "SECTION",
      "SECTION",
      "SECTION",
    ]);
    const request = within(groups[0]!);
    const response = within(groups[1]!);
    const nextRequest = within(groups[2]!);
    expect(request.getByText("Context")).toBeInTheDocument();
    expect(request.getByText("read the file")).toBeInTheDocument();
    expect(request.queryByText("Reading now")).not.toBeInTheDocument();
    expect(response.getByText("Reading now")).toBeInTheDocument();
    expect(response.getByText("Tool call")).toBeInTheDocument();
    expect(nextRequest.getByText("Tool result")).toBeInTheDocument();
    expect(nextRequest.getByText("Read")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Turn 2/ })).toHaveTextContent(
      "Tools: Read",
    );
    fireEvent.click(response.getByRole("button", { name: "Tool result →" }));
    expect(
      await nextRequest.findByText("unique result payload"),
    ).toBeInTheDocument();
    expect(
      response.queryByText("unique result payload"),
    ).not.toBeInTheDocument();
    expect(onSelectEvent).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search this session" }),
      { target: { value: "unique result payload" } },
    );
    expect(await screen.findByText("1 / 1")).toBeInTheDocument();
    expect(nextRequest.getByText("unique result payload").tagName).toBe("MARK");
    expect(source).toEqual(original);
  });

  it("places a compaction prompt in its request and the summary in its response", async () => {
    renderTrajectory(
      vi.fn(),
      null,
      vi.fn(),
      null,
      null,
      [
        item({
          kind: "compaction",
          stream: 0,
          turn_index: 1,
          event_pk: "request",
          input: "Summarize the session",
          output: "compact summary",
          output_event_pk: "response",
        }),
      ],
      [
        usageEvent({ event_pk: "request" }),
        usageEvent({ event_pk: "response", event_type: "response" }),
      ],
    );
    const groups = document.querySelectorAll<HTMLElement>(
      "[data-trajectory-event]",
    );
    const response = within(groups[1]!);
    expect(
      within(groups[0]!).getByText("Compaction prompt"),
    ).toBeInTheDocument();
    expect(response.getByText("Summary")).toBeInTheDocument();
    fireEvent.click(
      within(groups[0]!).getByRole("button", { name: "Summary →" }),
    );
    expect(await response.findByText("compact summary")).toBeInTheDocument();
    expect(
      within(groups[0]!).queryByText("compact summary"),
    ).not.toBeInTheDocument();
  });

  it("shows unclassified request text without guessing a role or dropping paragraphs", () => {
    const text = "system: instructions\n\nuser text\n\nuser text";
    renderTrajectory(vi.fn(), null, vi.fn(), null, null, [
      item({ kind: "request", stream: 0, turn_index: 1, text }),
    ]);
    expect(content().getByText("Request content")).toBeInTheDocument();
    expect(content().queryByText("Context")).not.toBeInTheDocument();
    expect(content().queryByText("User")).not.toBeInTheDocument();
    fireEvent.click(content().getByRole("button", { name: "Show more" }));
    expect(
      content().getByText(/system: instructions.*user text.*user text/s)
        .textContent,
    ).toBe(text);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("groups consecutive context into one searchable block and preserves event access", async () => {
    const onSelectEvent = vi.fn();
    const prompts = [
      item({
        kind: "context",
        stream: 0,
        turn_index: 1,
        text: "system instructions",
      }),
      item({
        kind: "context",
        stream: 0,
        turn_index: 1,
        text: "developer guidance",
      }),
      item({ kind: "user", stream: 0, turn_index: 1, text: "hello" }),
      item({
        kind: "context",
        stream: 0,
        turn_index: 1,
        text: "later context",
      }),
      item({ kind: "context", stream: 1, turn_index: 1, text: "side context" }),
      item({
        kind: "context",
        stream: 1,
        turn_index: 2,
        text: "next turn context",
      }),
    ];
    const original = structuredClone(prompts);
    renderTrajectory(onSelectEvent, null, vi.fn(), null, null, prompts);
    expect(content().getAllByText("Context")).toHaveLength(4);
    expect(content().queryByText("developer guidance")).not.toBeInTheDocument();
    fireEvent.click(
      content().getAllByRole("button", { name: "Show more" })[0]!,
    );
    expect(
      content().getByText(/system instructions.*developer guidance/s)
        .textContent,
    ).toBe("system instructions\n\ndeveloper guidance");
    fireEvent.click(content().getByRole("button", { name: "Open event 2" }));
    expect(onSelectEvent).toHaveBeenLastCalledWith(prompts[1]!.event_pk);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search this session" }),
      { target: { value: "guidance" } },
    );
    expect(await screen.findByText("1 / 1")).toBeInTheDocument();
    expect(prompts).toEqual(original);
  });

  it("threads every turn on a timeline and selects one", () => {
    const onFocusTurn = vi.fn();
    renderTrajectory(vi.fn(), null, onFocusTurn);

    const nodes = within(
      screen.getByRole("listbox", { name: "Turns" }),
    ).getAllByRole("option");
    expect(nodes.map((node) => node.textContent)).toEqual([
      "All turns",
      expect.stringContaining("list files"),
      expect.stringContaining("Found README"),
    ]);
    expect(nodes[1]).toHaveTextContent("1 tools");

    fireEvent.click(nodes[2]!);
    expect(onFocusTurn).toHaveBeenLastCalledWith(2);
    cleanup();

    renderTrajectory(vi.fn(), 1, onFocusTurn);
    expect(content().getByText("list files")).toBeInTheDocument();
    expect(content().queryByText("Found README")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("listbox", { name: "Turns" }), {
      key: "ArrowDown",
    });
    expect(onFocusTurn).toHaveBeenLastCalledWith(2);
  });

  it("selects an item's raw event and a tool result's own event", () => {
    const onSelectEvent = vi.fn();
    renderTrajectory(onSelectEvent);

    expect(content().getByText("classifier input")).toBeInTheDocument();
    fireEvent.click(content().getByText("list files"));
    expect(onSelectEvent).toHaveBeenLastCalledWith("event-user-list files");

    // Expanding does not select; the result links to the event carrying it.
    fireEvent.click(screen.getAllByRole("button", { name: "Show more" })[1]!);
    expect(onSelectEvent).toHaveBeenCalledTimes(1);
    expect(content().getByText("README.md")).toBeInTheDocument();
    fireEvent.click(content().getByRole("button", { name: "Open event" }));
    expect(onSelectEvent).toHaveBeenLastCalledWith("event-result");
  });

  it("highlights the selected event and shows the inspector beside it", () => {
    renderTrajectory(
      vi.fn(),
      null,
      vi.fn(),
      "event-user-list files",
      <aside>raw event panel</aside>,
    );

    const row = content().getByText("list files").closest("[aria-pressed]");
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("raw event panel")).toBeInTheDocument();
  });

  it("shows a compaction as one collapsed item with its prompt and summary", () => {
    const onSelectEvent = vi.fn();
    renderTrajectory(onSelectEvent, null, vi.fn(), null, null, [
      item({
        kind: "user",
        stream: 0,
        turn_index: 1,
        text: "write the report",
      }),
      item({
        kind: "compaction",
        stream: 0,
        turn_index: 1,
        input: "You are performing a CONTEXT CHECKPOINT COMPACTION.",
        output: "## Goal\nFinish the report.",
        output_event_pk: "event-summary",
      }),
    ]);

    expect(content().getByText("Context compaction")).toBeInTheDocument();
    // The collapsed row previews the summary rather than the fixed prompt.
    expect(
      content().getByText("## Goal Finish the report."),
    ).toBeInTheDocument();
    expect(content().queryByText("Compaction prompt")).not.toBeInTheDocument();

    fireEvent.click(content().getByRole("button", { name: "Show more" }));
    expect(content().getByText("Compaction prompt")).toBeInTheDocument();
    expect(content().getByText("Summary")).toBeInTheDocument();
    fireEvent.click(content().getByRole("button", { name: "Open event" }));
    expect(onSelectEvent).toHaveBeenLastCalledWith("event-summary");
  });
});

describe("SessionTrajectory search", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("steps through matches, switching to their turns and marking the text", async () => {
    const onFocusTurn = vi.fn();
    renderTrajectory(vi.fn(), 2, onFocusTurn);

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search this session" }),
      {
        target: { value: "readme" },
      },
    );

    // The tool result in turn 1 and the reply in turn 2 both mention README.
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    expect(onFocusTurn).toHaveBeenLastCalledWith(1);
    const turns = within(screen.getByRole("listbox", { name: "Turns" }));
    expect(turns.getAllByText("1 hits")).toHaveLength(2);

    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Search this session" }),
      {
        key: "Enter",
      },
    );
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    const mark = content().getByText("README");
    expect(mark.tagName).toBe("MARK");
  });

  it("lets the reader browse turns without pulling the view back", async () => {
    const onFocusTurn = vi.fn();
    const view = renderTrajectory(vi.fn(), 1, onFocusTurn);
    const shown = (focusedTurn: number | null) =>
      view.rerender(
        <SessionTrajectory
          items={items}
          selectedEventId={null}
          onSelectEvent={vi.fn()}
          focusedTurn={focusedTurn}
          onFocusTurn={onFocusTurn}
          formatTime={(value) => value}
          formatNumber={(value) => value.toString()}
          labels={labels}
        />,
      );

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search this session" }),
      { target: { value: "readme" } },
    );
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    const turns = within(screen.getByRole("listbox", { name: "Turns" }));

    // Picking a turn with matches moves to its first match.
    fireEvent.click(turns.getByText("Turn 2"));
    expect(onFocusTurn).toHaveBeenLastCalledWith(2);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    shown(2);

    // Going back to turn 1 stays there instead of returning to turn 2.
    onFocusTurn.mockClear();
    fireEvent.click(turns.getByText("Turn 1"));
    shown(1);
    expect(onFocusTurn).toHaveBeenLastCalledWith(1);
    expect(onFocusTurn).not.toHaveBeenCalledWith(2);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    // Showing every turn stays there instead of returning to the match.
    onFocusTurn.mockClear();
    fireEvent.click(turns.getByText("All turns"));
    shown(null);
    expect(onFocusTurn.mock.calls).toEqual([[null]]);
  });

  it("opens every item with a hit so scrolling shows them", async () => {
    renderTrajectory(vi.fn(), null, vi.fn(), null, null, [
      item({ kind: "user", stream: 0, turn_index: 1, text: "look around" }),
      item({
        kind: "tool_call",
        stream: 0,
        turn_index: 1,
        name: "exec",
        input: "cat a.txt",
        output: "first needle",
      }),
      item({
        kind: "tool_call",
        stream: 0,
        turn_index: 1,
        name: "exec",
        input: "cat b.txt",
        output: "second needle",
      }),
    ]);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search this session" }),
      { target: { value: "needle" } },
    );

    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    // Both tool calls are open, not only the one being viewed.
    const marks = content().getAllByText("needle");
    expect(marks.map((mark) => mark.tagName)).toEqual(["MARK", "MARK"]);
    expect(marks[0]).toHaveAttribute("data-active-match");
    expect(marks[1]).not.toHaveAttribute("data-active-match");
  });

  it("opens with a carried-over search and shows its first match", async () => {
    const onQueryChange = vi.fn();
    renderTrajectory(vi.fn(), null, vi.fn(), null, null, items, undefined, {
      initialQuery: "readme",
      onQueryChange,
    });

    expect(
      screen.getByRole("textbox", { name: "Search this session" }),
    ).toHaveValue("readme");
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    expect(content().getAllByText("README")[0]).toHaveAttribute(
      "data-active-match",
    );
    // The text the view opened with is not reported back.
    expect(onQueryChange).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search this session" }),
      { target: { value: "" } },
    );
    await waitFor(() => expect(onQueryChange).toHaveBeenLastCalledWith(""));
  });

  it("starts a carried-over search inside the turn it was opened on", async () => {
    const onFocusTurn = vi.fn();
    renderTrajectory(vi.fn(), 2, onFocusTurn, null, null, items, undefined, {
      initialQuery: "readme",
      strict: true,
    });

    // Turn 2's reply is the second of two matches; the view stays on turn 2.
    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    expect(onFocusTurn).not.toHaveBeenCalled();
    expect(content().getByText("README")).toHaveAttribute("data-active-match");
  });

  it("reports when nothing matches", async () => {
    renderTrajectory(vi.fn());
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search this session" }),
      {
        target: { value: "nothing like this" },
      },
    );
    expect(await screen.findByText("No matches")).toBeInTheDocument();
  });
});

/** Queries scoped to the selected turn's content, excluding the timeline. */
function content() {
  const region = document.querySelector<HTMLElement>(
    "[data-trajectory-content]",
  );
  if (region === null) {
    throw new Error("trajectory content is not rendered");
  }
  return within(region);
}

function renderTrajectory(
  onSelectEvent: (eventPk: string) => void,
  focusedTurn: number | null = null,
  onFocusTurn: (turnIndex: number | null) => void = vi.fn(),
  selectedEventId: string | null = null,
  inspector: React.ReactNode = null,
  trajectoryItems: SessionTrajectoryItem[] = items,
  events?: SessionTrajectoryEvent[],
  {
    strict = false,
    ...search
  }: Pick<SessionTrajectoryProps, "initialQuery" | "onQueryChange"> & {
    /** Renders under StrictMode, which runs effects twice on mount. */
    strict?: boolean;
  } = {},
) {
  // jsdom has no layout, so give the virtualized list a measurable viewport.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 1200,
    height: 800,
    top: 0,
    left: 0,
    right: 1200,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1200);
  return render(
    <SessionTrajectory
      items={trajectoryItems}
      events={events}
      selectedEventId={selectedEventId}
      onSelectEvent={onSelectEvent}
      inspector={inspector}
      focusedTurn={focusedTurn}
      onFocusTurn={onFocusTurn}
      formatTime={(value) => value}
      formatNumber={(value) => value.toString()}
      labels={labels}
      {...search}
    />,
    strict ? { wrapper: StrictMode } : undefined,
  );
}

function item(
  fields: Partial<SessionTrajectoryItem> &
    Pick<SessionTrajectoryItem, "kind" | "stream" | "turn_index">,
): SessionTrajectoryItem {
  return {
    event_pk: `event-${fields.kind}-${fields.text ?? fields.name ?? ""}`,
    observed_at: "2026-09-01T00:00:00Z",
    llm_model: "gpt-5",
    ...fields,
  };
}

function usageEvent(
  fields: Partial<SessionTrajectoryEvent>,
): SessionTrajectoryEvent {
  return {
    event_pk: "event",
    turn_index: 1,
    event_type: "request",
    observed_at: "2026-09-01T00:00:00Z",
    llm_model: "gpt-5",
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 0,
    token_usage_available: true,
    token_usage_estimated: false,
    ...fields,
  };
}

const labels: SessionTrajectoryLabels = {
  eventRequest: "Request",
  eventResponse: "Response",
  tokens: "tokens",
  inputTokens: "Input",
  outputTokens: "Output",
  cacheReadTokens: "Cache read",
  cacheWriteTokens: "Cache write",
  reasoningTokens: "Reasoning (included in output)",
  estimatedTokens: "Estimated",
  tokensUnavailable: "Token usage unavailable",
  unknownModel: "Unknown model",
  noNewContent: "No new content",
  request: "Request content",
  context: "Context",
  user: "User",
  assistant: "Assistant",
  toolCall: "Tool call",
  toolResult: "Tool result",
  compaction: "Context compaction",
  compactionPrompt: "Compaction prompt",
  compactionSummary: "Summary",
  input: "Input",
  output: "Output",
  noOutput: "No output",
  showMore: "Show more",
  showLess: "Show less",
  openEvent: "Open event",
  turn: (index) => `Turn ${index}`,
  characters: (count) => `${count} chars`,
  summary: (count, toolCalls) => `${count} items ${toolCalls} tools`,
  empty: "Empty",
  allTurns: "All turns",
  turnList: "Turns",
  toolCount: (count) => `${count} tools`,
  toolsOnly: (names) => `Tools: ${names}`,
  search: "Search this session",
  searchPosition: (current, total) => `${current} / ${total}`,
  searchNoMatches: "No matches",
  searchPrevious: "Previous match",
  searchNext: "Next match",
  searchClear: "Clear search",
  searchTurnMatches: (count) => `${count} hits`,
};
