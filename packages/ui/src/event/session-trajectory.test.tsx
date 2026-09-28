import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

  it("shows side requests inline, expands tool results, and opens raw events", () => {
    const onOpenEvent = vi.fn();
    renderTrajectory(onOpenEvent);

    expect(content().getByText("list files")).toBeInTheDocument();
    expect(content().getByText("classifier input")).toBeInTheDocument();
    expect(content().queryByText("README.md")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Show more" })[1]!);
    expect(content().getByText("README.md")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Open event" })[1]!);
    expect(onOpenEvent).toHaveBeenCalledWith("event-user-list files");
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
  onOpenEvent: (eventPk: string) => void,
  focusedTurn: number | null = null,
  onFocusTurn: (turnIndex: number | null) => void = vi.fn(),
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
      items={items}
      onOpenEvent={onOpenEvent}
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
};
