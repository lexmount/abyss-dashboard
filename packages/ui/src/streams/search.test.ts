import { describe, expect, it } from "vitest";
import type { SessionTextSearchResponse } from "./types";
import {
  highlightSegments,
  landingOccurrence,
  matchesBySegment,
  occurrencesBetween,
  sessionMatches,
  streamOccurrences,
} from "./search";

// Hits in the backend's order: by observation time, which interleaves the
// two segments. Segment "b" (exchange 2) carried context before its new part.
const result: SessionTextSearchResponse = {
  query: "timeout",
  texts: [
    { id: 1, ranges: [[8, 15]] },
    { id: 2, ranges: [[0, 7]] },
    {
      id: 3,
      ranges: [
        [0, 7],
        [12, 19],
      ],
    },
    { id: 4, ranges: [[4, 11]] },
  ],
  hits: [
    {
      event_pk: "r1",
      entry_index: 0,
      field: "text",
      new: true,
      text_id: 1,
      segment: "a",
    },
    {
      event_pk: "s1",
      entry_index: 0,
      field: "name",
      new: true,
      text_id: 2,
      segment: "a",
    },
    {
      event_pk: "s1",
      entry_index: 0,
      field: "text",
      new: true,
      text_id: 2,
      segment: "a",
    },
    {
      event_pk: "s1",
      entry_index: 1,
      field: "text",
      new: true,
      text_id: 3,
      segment: "a",
    },
    {
      event_pk: "r2",
      entry_index: 0,
      field: "text",
      new: false,
      text_id: 1,
      segment: "b",
    },
    {
      event_pk: "r2",
      entry_index: 1,
      field: "text",
      new: false,
      text_id: 3,
      segment: "b",
    },
    {
      event_pk: "r2",
      entry_index: 2,
      field: "text",
      new: true,
      text_id: 1,
      segment: "b",
    },
    {
      event_pk: "r3",
      entry_index: 0,
      field: "text",
      new: true,
      text_id: 1,
      segment: "a",
    },
    {
      event_pk: "s2",
      entry_index: 0,
      field: "text",
      new: true,
      text_id: 4,
      segment: "b",
    },
    // An event in no exchange, and one in a segment the page does not list.
    {
      event_pk: "orphan",
      entry_index: 0,
      field: "text",
      new: true,
      text_id: 1,
      segment: null,
    },
    {
      event_pk: "late",
      entry_index: 0,
      field: "text",
      new: true,
      text_id: 1,
      segment: "z",
    },
  ],
  truncated: false,
};

describe("sessionMatches", () => {
  it("gives each hit the ranges of its text", () => {
    const matches = sessionMatches(result);
    expect(matches.get("s1")?.get(0)).toEqual({
      name: [[0, 7]],
      text: [[0, 7]],
    });
    expect(matches.get("r2")?.get(1)).toEqual({
      name: [],
      text: [
        [0, 7],
        [12, 19],
      ],
    });
  });

  it("counts the occurrences in a run of entries", () => {
    const matches = sessionMatches(result).get("r2");
    expect(occurrencesBetween(matches, 0, 2)).toBe(3);
    expect(occurrencesBetween(matches, 2, 9)).toBe(1);
    expect(occurrencesBetween(undefined, 0, 9)).toBe(0);
  });
});

describe("streamOccurrences", () => {
  it("lists every range by segment, then in the backend's order", () => {
    const occurrences = streamOccurrences(["a", "b"], result);

    expect(
      occurrences.map((item) => [
        item.eventPk,
        item.segment,
        item.entryIndex,
        item.field,
        item.occurrence,
        item.range,
        item.context,
      ]),
    ).toEqual([
      // Segment a: exchange 1, request before response, name before text,
      // then exchange 3, observed after segment b had started.
      ["r1", "a", 0, "text", 0, [8, 15], false],
      ["s1", "a", 0, "name", 0, [0, 7], false],
      ["s1", "a", 0, "text", 0, [0, 7], false],
      ["s1", "a", 1, "text", 0, [0, 7], false],
      ["s1", "a", 1, "text", 1, [12, 19], false],
      ["r3", "a", 0, "text", 0, [8, 15], false],
      // Segment b: the request's context first, as its entries come.
      ["r2", "b", 0, "text", 0, [8, 15], true],
      ["r2", "b", 1, "text", 0, [0, 7], true],
      ["r2", "b", 1, "text", 1, [12, 19], true],
      ["r2", "b", 2, "text", 0, [8, 15], false],
      ["s2", "b", 0, "text", 0, [4, 11], false],
    ]);
    expect(matchesBySegment(occurrences)).toEqual(
      new Map([
        ["a", 6],
        ["b", 5],
      ]),
    );
  });

  it("follows the order the segments are given in", () => {
    const occurrences = streamOccurrences(["b", "a"], result);
    expect(occurrences[0]).toMatchObject({
      eventPk: "r2",
      segment: "b",
      context: true,
    });
    expect(occurrences.at(-1)).toMatchObject({ eventPk: "r3", segment: "a" });
  });

  it("finds nothing without hits", () => {
    expect(
      streamOccurrences(["a"], { ...result, texts: [], hits: [] }),
    ).toEqual([]);
  });

  it("lands on an event's first new occurrence, else its first", () => {
    const occurrences = streamOccurrences(["a", "b"], result);
    expect(landingOccurrence(occurrences, "r2")).toBe(9);
    expect(landingOccurrence(occurrences, "s1")).toBe(1);
    const contextOnly = occurrences.filter(
      (item) => item.eventPk !== "r2" || item.context,
    );
    expect(landingOccurrence(contextOnly, "r2")).toBe(6);
    expect(landingOccurrence(occurrences, "missing")).toBe(-1);
  });
});

describe("highlightSegments", () => {
  it("marks the given ranges and keeps the text between them", () => {
    expect(
      highlightSegments("Timeout and timeout", [
        [0, 7],
        [12, 19],
      ]),
    ).toEqual([
      { text: "Timeout", range: 0 },
      { text: " and ", range: null },
      { text: "timeout", range: 1 },
    ]);
  });

  it("slices by UTF-16 code units, around characters outside the BMP", () => {
    // "😀" and "𝒜" are two code units each.
    const text = "😀 Æther 𝒜æther😀";
    expect(
      highlightSegments(text, [
        [3, 8],
        [11, 16],
      ]),
    ).toEqual([
      { text: "😀 ", range: null },
      { text: "Æther", range: 0 },
      { text: " 𝒜", range: null },
      { text: "æther", range: 1 },
      { text: "😀", range: null },
    ]);
  });

  it("marks a range that is a surrogate pair whole", () => {
    expect(highlightSegments("a😀b", [[1, 3]])).toEqual([
      { text: "a", range: null },
      { text: "😀", range: 0 },
      { text: "b", range: null },
    ]);
  });

  it("cuts ranges at the end of a shortened text", () => {
    expect(
      highlightSegments("line 1\nline 2", [
        [7, 13],
        [20, 26],
      ]),
    ).toEqual([
      { text: "line 1\n", range: null },
      { text: "line 2", range: 0 },
    ]);
    expect(highlightSegments("line", [[2, 9]])).toEqual([
      { text: "li", range: null },
      { text: "ne", range: 0 },
    ]);
  });

  it("leaves text untouched without ranges", () => {
    expect(highlightSegments("plain", [])).toEqual([
      { text: "plain", range: null },
    ]);
  });
});
