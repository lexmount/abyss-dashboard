import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SessionTrajectory,
  trajectoryRows,
  trajectoryTurnSummaries,
  type SessionTrajectoryItem,
  type SessionTrajectoryLabels,
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
        row.kind === "turn" ? `turn-${row.turnIndex}` : row.item.kind,
      ),
    ).toEqual(["turn-2", "assistant"]);
  });

  it("keeps side requests inline and inserts turn headers", () => {
    const rows = trajectoryRows(items);

    expect(
      rows.map((row) =>
        row.kind === "turn" ? `turn-${row.turnIndex}` : row.item.kind,
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
      selectedEventId={selectedEventId}
      onSelectEvent={onSelectEvent}
      inspector={inspector}
      focusedTurn={focusedTurn}
      onFocusTurn={onFocusTurn}
      formatTime={(value) => value}
      formatNumber={(value) => value.toString()}
      labels={labels}
    />,
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

const labels: SessionTrajectoryLabels = {
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
