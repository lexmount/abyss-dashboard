/** In-session text search over merged trajectory items. */

import type { SessionTrajectoryItem } from "./session-trajectory";

/** One trajectory item containing the query, with its occurrence count. */
export interface TrajectoryMatch {
  itemIndex: number;
  turnIndex: number;
  occurrences: number;
}

/** Fields searched, in the order their occurrences are numbered. */
export const searchableFields = ["name", "text", "input", "output"] as const;
export type SearchableField = (typeof searchableFields)[number];

/** Text an item shows or reveals when expanded, in reading order. */
function searchableText(item: SessionTrajectoryItem): string[] {
  return searchableFields
    .map((field) => item[field])
    .filter(
      (value): value is string => value !== undefined && value.length > 0,
    );
}

/** One occurrence of the query: the unit that stepping moves through. */
export interface TrajectoryOccurrence {
  itemIndex: number;
  turnIndex: number;
  /** Position among this item's occurrences, numbered across its fields. */
  occurrence: number;
}

/** Every occurrence in session order. */
export function occurrencesOf(
  matches: readonly TrajectoryMatch[],
): TrajectoryOccurrence[] {
  return matches.flatMap((match) =>
    Array.from({ length: match.occurrences }, (_, occurrence) => ({
      itemIndex: match.itemIndex,
      turnIndex: match.turnIndex,
      occurrence,
    })),
  );
}

/**
 * Where each field's occurrences start in the item's numbering, so a field
 * can tell which of its own occurrences is the active one.
 */
export function fieldOccurrenceOffsets(
  item: SessionTrajectoryItem,
  query: string,
): Record<SearchableField, number> {
  const needle = query.trim().toLocaleLowerCase();
  const offsets = {} as Record<SearchableField, number>;
  let total = 0;
  for (const field of searchableFields) {
    offsets[field] = total;
    const value = item[field];
    if (needle.length > 0 && value) {
      total += countOccurrences(value.toLocaleLowerCase(), needle);
    }
  }
  return offsets;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    count += 1;
    from = haystack.indexOf(needle, from + needle.length);
  }
  return count;
}

/**
 * Finds every item containing the query, case-insensitively, in session
 * order. A blank query matches nothing.
 */
export function searchTrajectory(
  items: readonly SessionTrajectoryItem[],
  query: string,
): TrajectoryMatch[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) {
    return [];
  }
  const matches: TrajectoryMatch[] = [];
  items.forEach((item, itemIndex) => {
    const occurrences = searchableText(item).reduce(
      (total, text) =>
        total + countOccurrences(text.toLocaleLowerCase(), needle),
      0,
    );
    if (occurrences > 0) {
      matches.push({ itemIndex, turnIndex: item.turn_index, occurrences });
    }
  });
  return matches;
}

/** Occurrences per turn, for marking matching turns in the timeline. */
export function matchesByTurn(
  matches: readonly TrajectoryMatch[],
): Map<number, number> {
  const turns = new Map<number, number>();
  for (const match of matches) {
    turns.set(
      match.turnIndex,
      (turns.get(match.turnIndex) ?? 0) + match.occurrences,
    );
  }
  return turns;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Splits text into plain and matching segments, keeping the original case. */
export function highlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0 || text.length === 0) {
    return [{ text, match: false }];
  }
  const lower = text.toLocaleLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  let found = lower.indexOf(needle);
  while (found !== -1) {
    if (found > cursor) {
      segments.push({ text: text.slice(cursor, found), match: false });
    }
    segments.push({
      text: text.slice(found, found + needle.length),
      match: true,
    });
    cursor = found + needle.length;
    found = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}
