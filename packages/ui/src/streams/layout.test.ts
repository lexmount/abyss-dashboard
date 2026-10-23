import { describe, expect, it } from "vitest";
import { streamLayout } from "./layout";
import type { StreamSegment } from "./types";

/** A segment starting `minute` minutes in, lasting under one. */
function segment(
  head: string,
  minute: number,
  fields: Partial<StreamSegment> = {},
): StreamSegment {
  const at = (seconds: number) =>
    new Date(Date.UTC(2026, 9, 20, 1, minute, seconds)).toISOString();
  return {
    head,
    kind: "root",
    parent: null,
    forked_from: null,
    start: at(0),
    end: at(50),
    exchange_count: 1,
    label: null,
    subagent_id: null,
    attached_to: null,
    attached_by: null,
    ...fields,
  };
}

const placement = (segments: StreamSegment[]) =>
  streamLayout(segments).rows.map((row) => [row.segment.head, row.column]);

describe("streamLayout with subagents", () => {
  it("puts each attached subagent right after its turn, one column out", () => {
    const layout = streamLayout([
      segment("m1", 0),
      segment("m2", 1, { kind: "turn", parent: "m1", forked_from: "m1" }),
      // Spawned from the first turn, declared; starts after the second.
      segment("s1", 2, {
        subagent_id: "a",
        attached_to: "m1",
        attached_by: "declared",
      }),
      segment("s1b", 3, {
        kind: "turn",
        parent: "s1",
        forked_from: "s1",
        subagent_id: "a",
      }),
      segment("m3", 4, { kind: "turn", parent: "m2", forked_from: "m2" }),
      segment("t1", 5, {
        subagent_id: "b",
        attached_to: "m3",
        attached_by: "time",
      }),
    ]);

    expect(
      layout.rows.map((row) => [row.segment.head, row.column, row.ordinal]),
    ).toEqual([
      ["m1", 0, 0],
      // The subagent's segments stay together in its tree's order.
      ["s1", 1, 2],
      ["s1b", 1, 3],
      ["m2", 0, 1],
      ["m3", 0, 4],
      ["t1", 1, 5],
    ]);
    expect(layout.lanes).toEqual([1, 1]);
    expect(
      [...layout.spawned].map(([anchor, spawned]) => [
        anchor,
        spawned.map((child) => [child.head, child.attached_by]),
      ]),
    ).toEqual([
      ["m1", [["s1", "declared"]]],
      ["m3", [["t1", "time"]]],
    ]);
    // Positions in the session stay those of session order.
    expect(layout.ordinalOf.get("s1")).toBe(2);
  });

  it("puts a subagent attached nowhere beside the main line at its start", () => {
    expect(
      placement([
        segment("m1", 0),
        segment("u1", 1, { subagent_id: "a" }),
        segment("u1b", 2, {
          kind: "turn",
          parent: "u1",
          forked_from: "u1",
          subagent_id: "a",
        }),
        segment("m2", 3, { kind: "turn", parent: "m1", forked_from: "m1" }),
        // Its anchor is not in the session.
        segment("u2", 4, { subagent_id: "b", attached_to: "gone" }),
      ]),
    ).toEqual([
      ["m1", 0],
      ["u1", 1],
      ["u1b", 1],
      ["m2", 0],
      ["u2", 1],
    ]);
  });

  it("nests a subagent spawned by a subagent one column further out", () => {
    expect(
      placement([
        segment("m1", 0),
        segment("a1", 1, { subagent_id: "a", attached_to: "m1" }),
        segment("a2", 2, {
          kind: "turn",
          parent: "a1",
          forked_from: "a1",
          subagent_id: "a",
        }),
        segment("b1", 3, { subagent_id: "b", attached_to: "a1" }),
        segment("m2", 4, { kind: "turn", parent: "m1", forked_from: "m1" }),
      ]),
    ).toEqual([
      ["m1", 0],
      ["a1", 1],
      ["b1", 2],
      ["a2", 1],
      ["m2", 0],
    ]);
  });

  it("keeps a subagent's forks in its own column with lanes of their own", () => {
    const layout = streamLayout([
      segment("m1", 0),
      segment("a1", 1, { subagent_id: "a", attached_to: "m1" }),
      segment("a2", 2, {
        kind: "branch",
        parent: "a1",
        forked_from: "a1",
        subagent_id: "a",
        exchange_count: 3,
      }),
      segment("a3", 2, {
        kind: "branch",
        parent: "a1",
        forked_from: "a1",
        subagent_id: "a",
      }),
      segment("a4", 3, {
        kind: "turn",
        parent: "a3",
        forked_from: "a3",
        subagent_id: "a",
      }),
    ]);
    const row = (head: string) =>
      layout.rows.find((candidate) => candidate.segment.head === head)!;

    expect(row("a1").forks).toBe(2);
    expect([row("a2").column, row("a2").lane]).toEqual([1, 0]);
    expect([row("a3").column, row("a3").lane]).toEqual([1, 1]);
    expect(layout.lanes).toEqual([1, 2]);
  });

  it("still shows subagents attached only to each other", () => {
    expect(
      placement([
        segment("m1", 0),
        segment("a1", 1, { subagent_id: "a", attached_to: "b1" }),
        segment("b1", 2, { subagent_id: "b", attached_to: "a1" }),
      ])
        .map(([head]) => head)
        .sort(),
    ).toEqual(["a1", "b1", "m1"]);
  });

  it("places a session without subagents in session order on the main line", () => {
    const layout = streamLayout([
      segment("m1", 0),
      segment("m2", 1, { kind: "turn", parent: "m1", forked_from: "m1" }),
    ]);
    expect(layout.rows.map((row) => [row.segment.head, row.column])).toEqual([
      ["m1", 0],
      ["m2", 0],
    ]);
    expect(layout.lanes).toEqual([1]);
    expect(layout.spawned.size).toBe(0);
  });
});
