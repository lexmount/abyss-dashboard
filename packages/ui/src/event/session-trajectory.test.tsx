import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mainTrajectoryStream,
  SessionTrajectory,
  trajectoryRows,
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
  it("picks the stream with the most items as the main flow", () => {
    expect(mainTrajectoryStream(items)).toBe(0);
    expect(mainTrajectoryStream([])).toBeNull();
  });

  it("filters to one stream and inserts turn headers", () => {
    const rows = trajectoryRows(items, 0);

    expect(
      rows.map((row) =>
        row.kind === "turn" ? `turn-${row.turnIndex}` : row.item.kind,
      ),
    ).toEqual([
      "turn-1",
      "context",
      "user",
      "tool_call",
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

  it("shows the main flow, expands tool results, and opens raw events", () => {
    const onOpenEvent = vi.fn();
    renderTrajectory(onOpenEvent);

    expect(screen.getByText("list files")).toBeInTheDocument();
    expect(screen.queryByText("classifier input")).not.toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Show more" })[1]!);
    expect(screen.getByText("README.md")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Open event" })[1]!);
    expect(onOpenEvent).toHaveBeenCalledWith("event-user-list files");

    fireEvent.click(screen.getByRole("button", { name: "All streams" }));
    expect(screen.getByText("classifier input")).toBeInTheDocument();
  });
});

function renderTrajectory(onOpenEvent: (eventPk: string) => void) {
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
  mainStream: "Main stream",
  allStreams: "All streams",
  streamLabel: (stream) => `Side ${stream}`,
  summary: (count, toolCalls) => `${count} items ${toolCalls} tools`,
  empty: "Empty",
};
