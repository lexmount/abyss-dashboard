import type { SessionTurn, StreamSegment } from "./types";

/** Where a segment is among a session's turns. */
export interface TurnPlace {
  /** Index of the turn in the list. */
  turn: number;
  /** Index of the executor within the turn. */
  executor: number;
  /** The segment when it is a side request; null on the main line. */
  side: string | null;
}

/** The turn, executor, and side request a segment is in, or null for none. */
export function turnPlace(
  turns: readonly SessionTurn[],
  head: string,
): TurnPlace | null {
  for (const [turn, item] of turns.entries()) {
    for (const [executor, { main, side }] of item.executors.entries()) {
      if (main.includes(head)) {
        return { turn, executor, side: null };
      }
      if (side.includes(head)) {
        return { turn, executor, side: head };
      }
    }
  }
  return null;
}

/**
 * The segments shown for a segment chosen: its executor's whole main line
 * when it is on one, else the segment alone.
 */
export function shownSegments(
  turns: readonly SessionTurn[],
  head: string,
): string[] {
  const place = turnPlace(turns, head);
  if (place === null || place.side !== null) {
    return [head];
  }
  return turns[place.turn].executors[place.executor].main;
}

/** The segment chosen for an executor: its main line's first, else a side one. */
export function executorHead(
  executor: SessionTurn["executors"][number],
): string | undefined {
  return executor.main[0] ?? executor.side[0];
}

/** The segment chosen for a turn: that of its first executor. */
export function turnHead(turn: SessionTurn): string | undefined {
  const [first] = turn.executors;
  return first === undefined ? undefined : executorHead(first);
}

/**
 * Segment heads in the timeline's order: turn by turn, each executor's main
 * line and then its side requests. Segments in no turn follow in session
 * order.
 */
export function turnSegmentOrder(
  turns: readonly SessionTurn[],
  segments: readonly StreamSegment[],
): string[] {
  const order = turns.flatMap((turn) =>
    turn.executors.flatMap((executor) => [...executor.main, ...executor.side]),
  );
  const listed = new Set(order);
  for (const segment of segments) {
    if (!listed.has(segment.head)) {
      order.push(segment.head);
    }
  }
  return order;
}
