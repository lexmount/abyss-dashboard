import { describe, expect, it } from "vitest";
import type { SessionTrajectoryItem } from "./session-trajectory";
import {
  fieldOccurrenceOffsets,
  highlightSegments,
  matchesByTurn,
  occurrencesOf,
  searchTrajectory,
} from "./session-trajectory-search";

function item(
  turn: number,
  fields: Partial<SessionTrajectoryItem>,
): SessionTrajectoryItem {
  return {
    kind: "assistant",
    stream: 0,
    turn_index: turn,
    event_pk: `event-${turn}`,
    observed_at: "2026-09-30T00:00:00Z",
    llm_model: "gpt-6",
    ...fields,
  };
}

describe("searchTrajectory", () => {
  const items = [
    item(1, { kind: "user", text: "Fix the Timeout in the uploader" }),
    item(1, { kind: "tool_call", name: "exec", input: "grep -n timeout src" }),
    item(2, { text: "No match here" }),
    item(2, { kind: "tool_result", output: "timeout=30\ntimeout=60" }),
  ];

  it("finds items case-insensitively across text, tool names, input, and output", () => {
    expect(searchTrajectory(items, " TIMEOUT ")).toEqual([
      { itemIndex: 0, turnIndex: 1, occurrences: 1 },
      { itemIndex: 1, turnIndex: 1, occurrences: 1 },
      { itemIndex: 3, turnIndex: 2, occurrences: 2 },
    ]);
    expect(searchTrajectory(items, "exec")).toEqual([
      { itemIndex: 1, turnIndex: 1, occurrences: 1 },
    ]);
  });

  it("matches nothing for a blank query", () => {
    expect(searchTrajectory(items, "   ")).toEqual([]);
  });

  it("totals occurrences per turn", () => {
    expect(matchesByTurn(searchTrajectory(items, "timeout"))).toEqual(
      new Map([
        [1, 2],
        [2, 2],
      ]),
    );
  });
});

describe("occurrencesOf", () => {
  it("lists every occurrence so stepping visits each hit", () => {
    const items = [
      item(1, { kind: "context", text: "hello … hello … Hello" }),
      item(2, { kind: "tool_call", name: "hello", output: "say hello" }),
    ];
    const occurrences = occurrencesOf(searchTrajectory(items, "hello"));

    expect(occurrences).toEqual([
      { itemIndex: 0, turnIndex: 1, occurrence: 0 },
      { itemIndex: 0, turnIndex: 1, occurrence: 1 },
      { itemIndex: 0, turnIndex: 1, occurrence: 2 },
      { itemIndex: 1, turnIndex: 2, occurrence: 0 },
      { itemIndex: 1, turnIndex: 2, occurrence: 1 },
    ]);
  });

  it("numbers occurrences across fields in reading order", () => {
    expect(
      fieldOccurrenceOffsets(
        item(1, {
          kind: "tool_call",
          name: "grep",
          input: "grep grep",
          output: "grep",
        }),
        "grep",
      ),
    ).toEqual({ name: 0, text: 1, input: 1, output: 3 });
  });
});

describe("highlightSegments", () => {
  it("marks every occurrence and keeps the original case", () => {
    expect(highlightSegments("Timeout and timeout", "TIMEOUT")).toEqual([
      { text: "Timeout", match: true },
      { text: " and ", match: false },
      { text: "timeout", match: true },
    ]);
  });

  it("leaves text untouched without a query", () => {
    expect(highlightSegments("plain", "")).toEqual([
      { text: "plain", match: false },
    ]);
  });
});
