import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamLayout } from "./layout";
import { StreamTimeline, type StreamTimelineLabels } from "./stream-timeline";
import type { StreamSegment } from "./types";

const labels: StreamTimelineLabels = {
  timeline: "Turn timeline",
  segmentNumber: (number) => `Turn ${number}`,
  segmentExchanges: (count) => `${count} exchanges`,
  segmentMatches: (count) => `${count} hits`,
  noUserInput: "No user input",
  continuesSegment: (number) => `Continues turn ${number}`,
  subagent: "Subagent",
  derived: "Derived",
  byTime: "by time",
};

function segment(
  head: string,
  minute: number,
  fields: Partial<StreamSegment> = {},
): StreamSegment {
  return {
    head,
    kind: "root",
    parent: null,
    forked_from: null,
    start: `2026-10-20T01:0${minute}:00Z`,
    end: `2026-10-20T01:0${minute}:50Z`,
    exchange_count: 1,
    label: null,
    subagent_id: null,
    attached_to: null,
    attached_by: null,
    ...fields,
  };
}

describe("StreamTimeline with subagents", () => {
  afterEach(() => {
    cleanup();
  });

  it("joins each subagent to its turn by a derivation line, marked by time when so attached", () => {
    const layout = streamLayout([
      segment("m1", 0),
      segment("d1", 1, {
        subagent_id: "a",
        attached_to: "m1",
        attached_by: "declared",
      }),
      segment("m2", 2, { kind: "turn", parent: "m1", forked_from: "m1" }),
      segment("t1", 3, {
        subagent_id: "b",
        attached_to: "m2",
        attached_by: "time",
      }),
      segment("u1", 4, { subagent_id: "c" }),
    ]);
    render(
      <StreamTimeline
        layout={layout}
        selected="m1"
        onSelect={vi.fn()}
        formatTime={(value) => value.slice(11, 19)}
        formatDateTime={(value) => value}
        formatNumber={(value) => String(value)}
        labels={labels}
      />,
    );

    const derivations = Array.from(
      document.querySelectorAll<SVGPathElement>("path[data-derivation]"),
      (path) => [path.dataset.derivation, path.dataset.by],
    );
    expect(derivations).toEqual([
      ["d1", "declared"],
      ["t1", "time"],
    ]);
    // Derivations are dotted, unlike continuations and forks.
    const continuation = document.querySelector<SVGPathElement>(
      "path:not([data-derivation]):not([data-spur])",
    );
    expect(continuation).not.toHaveAttribute("stroke-dasharray");
    expect(document.querySelector("path[data-derivation]")).toHaveAttribute(
      "stroke-dasharray",
    );

    const option = (head: string) =>
      document.querySelector<HTMLElement>(
        `[data-segment="${head}"][role="option"]`,
      )!;
    expect(within(option("d1")).getByText("Derived")).toBeInTheDocument();
    expect(
      within(option("t1")).getByText("Derived · by time"),
    ).toBeInTheDocument();
    // A subagent attached nowhere sits beside the main line, without a mark.
    expect(option("u1")).toHaveAttribute("data-column", "1");
    expect(within(option("u1")).queryByText(/Derived/)).not.toBeInTheDocument();
    expect(within(option("u1")).getByText("c")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(5);
  });
});
