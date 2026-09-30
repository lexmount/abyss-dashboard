/** In-session text search over merged trajectory items. */

import type { SessionTrajectoryItem } from "./session-trajectory";

/** One trajectory item containing the query, with its occurrence count. */
export interface TrajectoryMatch {
  itemIndex: number;
  turnIndex: number;
  occurrences: number;
}

/** Text an item shows or reveals when expanded, in reading order. */
function searchableText(item: SessionTrajectoryItem): string[] {
  return [item.name, item.text, item.input, item.output].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
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
