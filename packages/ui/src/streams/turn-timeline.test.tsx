import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TurnTimeline, type TurnTimelineLabels } from "./turn-timeline";
import type { SessionTurn, StreamSegment, TurnExecutor } from "./types";

const labels: TurnTimelineLabels = {
  timeline: "Turn timeline",
  turnNumber: (number) => `Turn ${number}`,
  noTurn: "No turn",
  segmentExchanges: (count) => `${count} exchanges`,
  segmentMatches: (count) => `${count} hits`,
  noUserInput: "No user input",
  newContext: "New context",
  mainLine: "Main line",
  line: (number) => `Line ${number}`,
  subagent: "Subagent",
  sideRequests: (count) => `Side requests ×${count}`,
};

const start = "2026-10-20T01:00:00Z";

function executor(more: Partial<TurnExecutor>): TurnExecutor {
  return {
    subagent_id: null,
    parent_subagent_id: null,
    main: [],
    side: [],
    exchange_count: 1,
    start,
    ...more,
  };
}

function turn(
  number: number,
  executors: TurnExecutor[],
  newContext = false,
): SessionTurn {
  return {
    turn: number,
    turn_id: `turn-${number}`,
    start,
    end: start,
    exchange_count: 1,
    label: null,
    new_context: newContext,
    executors,
  };
}

const segmentOf = new Map<string, StreamSegment>();

function renderTimeline(turns: SessionTurn[], selected: string | null = null) {
  const onSelect = vi.fn();
  render(
    <TurnTimeline
      turns={turns}
      segmentOf={segmentOf}
      selected={selected}
      onSelect={onSelect}
      formatTime={(value) => value.slice(11, 19)}
      formatDateTime={(value) => value}
      formatNumber={(value) => String(value)}
      labels={labels}
    />,
  );
  return { onSelect };
}

describe("TurnTimeline", () => {
  afterEach(cleanup);

  it("lists only the executors of turns that are more than a main line", () => {
    renderTimeline([
      turn(1, [executor({ main: ["a"] })], true),
      turn(2, [
        executor({ main: ["b"] }),
        executor({ subagent_id: "agent-7", main: ["c"] }),
      ]),
      turn(3, [executor({ main: ["d"] })], true),
    ]);

    const rows = [...document.querySelectorAll<HTMLElement>("li[data-turn]")];
    expect(
      rows.map((row) =>
        [...row.querySelectorAll<HTMLElement>("[data-executor]")].map(
          (item) => item.dataset.executor,
        ),
      ),
    ).toEqual([[], ["main", "agent-7"], []]);
    // A new context is marked above each turn without a base but the first.
    expect(
      rows.map((row) => row.querySelector("[data-new-context]") !== null),
    ).toEqual([false, false, true]);
  });

  it("numbers the lines of a turn grouped without sub-agents", () => {
    renderTimeline([
      turn(1, [
        executor({ main: ["a"] }),
        executor({ main: ["b"] }),
        executor({ subagent_id: "agent-7", main: ["c"] }),
      ]),
    ]);

    const names = [
      ...document.querySelectorAll<HTMLElement>("[data-executor]"),
    ].map((item) => [
      item.dataset.executor,
      item.querySelector("button")?.textContent,
    ]);
    expect(names.map(([key]) => key)).toEqual(["line-1", "line-2", "agent-7"]);
    expect(names[0]?.[1]).toContain("Line 1");
    expect(names[1]?.[1]).toContain("Line 2");
  });

  it("goes to a turn, and to a side request once unfolded", () => {
    const { onSelect } = renderTimeline([
      turn(1, [executor({ main: ["a"], side: ["s"] })]),
      turn(2, [executor({ main: ["b"] })]),
    ]);

    const timeline = screen.getByRole("listbox", { name: "Turn timeline" });
    fireEvent.click(within(timeline).getAllByRole("option")[1]);
    expect(onSelect).toHaveBeenLastCalledWith("b");

    // A main line with side requests keeps its row, the side ones folded.
    expect(document.querySelector("[data-side]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Side requests ×1/ }));
    fireEvent.click(document.querySelector<HTMLElement>('[data-side="s"]')!);
    expect(onSelect).toHaveBeenLastCalledWith("s");
  });

  it("hangs the subagents a subagent started under it", () => {
    renderTimeline([
      turn(1, [
        executor({ main: ["m"] }),
        executor({ subagent_id: "a1", main: ["a"] }),
        executor({ subagent_id: "a2", parent_subagent_id: "a1", main: ["b"] }),
        executor({ subagent_id: "b1", main: ["c"] }),
        // Its parent is not in the turn: under the main lane.
        executor({
          subagent_id: "c1",
          parent_subagent_id: "gone",
          main: ["d"],
        }),
      ]),
    ]);

    const rows = [...document.querySelectorAll<HTMLElement>("[data-executor]")];
    expect(
      rows.map((row) => [row.dataset.executor, row.style.marginLeft]),
    ).toEqual([
      ["main", ""],
      ["a1", ""],
      ["a2", "14px"],
      ["b1", ""],
      ["c1", ""],
    ]);
    // Only a2 comes off another subagent's dot.
    expect(
      [...document.querySelectorAll<SVGPathElement>("[data-derivation]")].map(
        (path) => [path.dataset.derivation, path.dataset.parent ?? null],
      ),
    ).toEqual([
      ["a1", null],
      ["a2", "a1"],
      ["b1", null],
      ["c1", null],
    ]);
  });
});
