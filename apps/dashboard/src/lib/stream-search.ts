/**
 * Text search within one session. The backend finds the query, says where it
 * is in each entry and which segment each event is in; this places those
 * occurrences in the page's order and marks them in the text the cards show.
 */

import type { SessionTextSearchResponse, TextRange } from "@/api/usage";

/** Fields of an entry searched, in the order their occurrences are numbered. */
export const searchableFields = ["name", "text"] as const;
export type SearchableField = (typeof searchableFields)[number];

/** Where the query is in one conversation entry, field by field. */
export type EntryMatches = Readonly<Record<SearchableField, readonly TextRange[]>>;

/** The entries of one event with the query in them, by position. */
export type EventMatches = ReadonlyMap<number, EntryMatches>;

/** The events of a session with the query in them, by pk. */
export type SessionMatches = ReadonlyMap<string, EventMatches>;

/** The ranges of a search's hits, by event and then entry. */
export function sessionMatches(result: SessionTextSearchResponse): SessionMatches {
  const ranges = textRanges(result);
  const events = new Map<
    string,
    Map<number, { name: TextRange[]; text: TextRange[] }>
  >();
  for (const hit of result.hits) {
    const found = ranges.get(hit.text_id);
    if (!found || found.length === 0) {
      continue;
    }
    let entries = events.get(hit.event_pk);
    if (!entries) {
      entries = new Map();
      events.set(hit.event_pk, entries);
    }
    let entry = entries.get(hit.entry_index);
    if (!entry) {
      entry = { name: [], text: [] };
      entries.set(hit.entry_index, entry);
    }
    entry[hit.field] = found;
  }
  return events;
}

function textRanges(result: SessionTextSearchResponse): Map<number, TextRange[]> {
  return new Map(result.texts.map((text) => [text.id, text.ranges]));
}

/** One occurrence of the query: the unit that stepping moves through. */
export interface StreamOccurrence {
  eventPk: string;
  /** Head of the segment the event's exchange is in. */
  segment: string;
  /** Position of the entry in its event's conversation. */
  entryIndex: number;
  field: SearchableField;
  /** Position among the occurrences in this field of the entry. */
  occurrence: number;
  range: TextRange;
  /** The hit is in the context its event carried over, not what it added. */
  context: boolean;
}

/**
 * Every occurrence of the query in the order the page lists them: by
 * segment in the order given, then as the backend gives the hits within a
 * segment, and by place in the text. A segment's exchanges follow each other
 * in time, each request observed before its response, so the backend's order
 * by observation is the order of the segment's exchanges, request before
 * response; within an event it goes by entry, name before text. Events in no
 * segment the page lists are left out.
 */
export function streamOccurrences(
  segments: readonly string[],
  result: SessionTextSearchResponse,
): StreamOccurrence[] {
  const ranges = textRanges(result);
  const bySegment = new Map<string, StreamOccurrence[]>(
    segments.map((head) => [head, []]),
  );
  for (const hit of result.hits) {
    const list = hit.segment === null ? undefined : bySegment.get(hit.segment);
    const found = ranges.get(hit.text_id);
    if (!list || !found || hit.segment === null) {
      continue;
    }
    found.forEach((range, occurrence) => {
      list.push({
        eventPk: hit.event_pk,
        segment: hit.segment as string,
        entryIndex: hit.entry_index,
        field: hit.field,
        occurrence,
        range,
        context: !hit.new,
      });
    });
  }
  return segments.flatMap((head) => bySegment.get(head) ?? []);
}

/** Occurrences per segment, by its head, for marking the timeline. */
export function matchesBySegment(
  occurrences: readonly StreamOccurrence[],
): Map<string, number> {
  const segments = new Map<string, number>();
  for (const { segment } of occurrences) {
    segments.set(segment, (segments.get(segment) ?? 0) + 1);
  }
  return segments;
}

/**
 * Where a search opened on an event starts: its first occurrence in what
 * the event added, else its first in the context it carried, else none (-1).
 */
export function landingOccurrence(
  occurrences: readonly StreamOccurrence[],
  eventPk: string,
): number {
  const added = occurrences.findIndex(
    (occurrence) => occurrence.eventPk === eventPk && !occurrence.context,
  );
  return added !== -1
    ? added
    : occurrences.findIndex((occurrence) => occurrence.eventPk === eventPk);
}

/** Occurrences in one entry. */
export function occurrenceCount(entry: EntryMatches | undefined): number {
  return entry ? entry.name.length + entry.text.length : 0;
}

/** Occurrences in the entries of an event from `from` up to `to`. */
export function occurrencesBetween(
  matches: EventMatches | undefined,
  from: number,
  to: number,
): number {
  let count = 0;
  for (const [index, entry] of matches ?? []) {
    if (index >= from && index < to) {
      count += occurrenceCount(entry);
    }
  }
  return count;
}

export interface HighlightSegment {
  text: string;
  /** Index of the range the text is, or null between ranges. */
  range: number | null;
}

/**
 * Splits text into plain runs and the given ranges. A range past the end of
 * the text, as when only its start is shown, is cut at the end or left out.
 */
export function highlightSegments(
  text: string,
  ranges: readonly TextRange[],
): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], range) => {
    const from = Math.max(start, cursor);
    const to = Math.min(end, text.length);
    if (from >= to) {
      return;
    }
    if (from > cursor) {
      segments.push({ text: text.slice(cursor, from), range: null });
    }
    segments.push({ text: text.slice(from, to), range });
    cursor = to;
  });
  if (cursor < text.length || segments.length === 0) {
    segments.push({ text: text.slice(cursor), range: null });
  }
  return segments;
}

/**
 * The text with each run of whitespace made one space and its ends trimmed,
 * cut to `maxLength`, with the ranges moved to where they land in it.
 */
export function collapseWhitespace(
  text: string,
  ranges: readonly TextRange[] | undefined,
  maxLength: number,
): { text: string; ranges: TextRange[] | undefined } {
  if (!ranges) {
    return { text: text.replace(/\s+/g, " ").trim().slice(0, maxLength), ranges };
  }
  // Where in the text each code unit of the result comes from.
  let collapsed = "";
  const sources: number[] = [];
  let cursor = 0;
  const copy = (end: number) => {
    collapsed += text.slice(cursor, end);
    for (let index = cursor; index < end; index += 1) {
      sources.push(index);
    }
  };
  for (const run of text.matchAll(/\s+/g)) {
    copy(run.index);
    collapsed += " ";
    sources.push(run.index);
    cursor = run.index + run[0].length;
  }
  copy(text.length);
  const start = collapsed.startsWith(" ") ? 1 : 0;
  const end = Math.min(
    Math.max(start, collapsed.endsWith(" ") ? collapsed.length - 1 : collapsed.length),
    start + maxLength,
  );
  const at = (source: number) =>
    Math.min(Math.max(lowerBound(sources, source), start), end) - start;
  return {
    text: collapsed.slice(start, end),
    ranges: ranges.map(([from, to]): TextRange => [at(from), at(to)]),
  };
}

/** The first index whose value is at least `value`, in ascending values. */
function lowerBound(values: readonly number[], value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}
