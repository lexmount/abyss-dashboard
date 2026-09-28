/** Pure row model for the virtualized session ledger. */

import type { SessionTimelineSession } from "./session-timeline";

/** Content-free event summary rendered as one ledger row. */
export interface SessionLedgerEvent {
  id: string;
  event_type: string;
  llm_provider: string;
  llm_model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  token_usage_estimated: boolean;
  observed_at: string;
  text_chars: number;
  preview: string | null;
  attachment_count: number;
}

export interface SessionLedgerTurn {
  turn_pk?: string;
  turn_index: number;
  started_at: string;
  ended_at: string | null;
  events: SessionLedgerEvent[];
}

/** Session outline in authoritative turn and event order. */
export interface SessionLedgerOutline {
  session: SessionTimelineSession;
  turns: SessionLedgerTurn[];
}

export type SessionLedgerFilter = "all" | "request" | "response";

export interface SessionLedgerTurnTotals {
  events: number;
  inputTokens: number;
  outputTokens: number;
}

export type SessionLedgerRow =
  | {
      kind: "turn";
      turn: SessionLedgerTurn;
      collapsed: boolean;
      totals: SessionLedgerTurnTotals;
    }
  | {
      kind: "event";
      event: SessionLedgerEvent;
      turnIndex: number;
      /** Session-wide 1-based number of a request; null for responses. */
      requestNumber: number | null;
    };

export function isRequestEvent(event: SessionLedgerEvent): boolean {
  return event.event_type === "request";
}

/** Numbers requests in outline order, like a trajectory's request boundaries. */
export function requestNumbers(
  turns: readonly SessionLedgerTurn[],
): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const turn of turns) {
    for (const event of turn.events) {
      if (isRequestEvent(event)) {
        numbers.set(event.id, numbers.size + 1);
      }
    }
  }
  return numbers;
}

export function turnTotals(turn: SessionLedgerTurn): SessionLedgerTurnTotals {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const event of turn.events) {
    inputTokens += event.input_tokens;
    outputTokens += event.output_tokens;
  }
  return { events: turn.events.length, inputTokens, outputTokens };
}

export function matchesFilter(
  event: SessionLedgerEvent,
  filter: SessionLedgerFilter,
): boolean {
  return filter === "all" || event.event_type === filter;
}

/** Flattens turns into turn-header and event rows; collapsed turns keep only their header. */
export function buildLedgerRows(
  turns: readonly SessionLedgerTurn[],
  options: {
    filter: SessionLedgerFilter;
    collapsedTurns: ReadonlySet<number>;
    numbers: ReadonlyMap<string, number>;
  },
): SessionLedgerRow[] {
  const rows: SessionLedgerRow[] = [];
  for (const turn of turns) {
    const collapsed = options.collapsedTurns.has(turn.turn_index);
    rows.push({ kind: "turn", turn, collapsed, totals: turnTotals(turn) });
    if (collapsed) {
      continue;
    }
    for (const event of turn.events) {
      if (!matchesFilter(event, options.filter)) {
        continue;
      }
      rows.push({
        kind: "event",
        event,
        turnIndex: turn.turn_index,
        requestNumber: options.numbers.get(event.id) ?? null,
      });
    }
  }
  return rows;
}

/** Returns the event row index `step` rows away from the selection, skipping turn headers. */
export function adjacentEventRowIndex(
  rows: readonly SessionLedgerRow[],
  selectedEventId: string | null,
  step: 1 | -1,
): number | null {
  const current =
    selectedEventId === null
      ? -1
      : rows.findIndex(
          (row) => row.kind === "event" && row.event.id === selectedEventId,
        );
  let index = current === -1 ? (step === 1 ? -1 : rows.length) : current;
  for (;;) {
    index += step;
    if (index < 0 || index >= rows.length) {
      return null;
    }
    if (rows[index]?.kind === "event") {
      return index;
    }
  }
}

/** Event IDs immediately before and after one event in outline order. */
export function neighborEventIds(
  turns: readonly SessionLedgerTurn[],
  eventId: string,
): string[] {
  const ids = turns.flatMap((turn) => turn.events.map((event) => event.id));
  const index = ids.indexOf(eventId);
  if (index === -1) {
    return [];
  }
  return [ids[index - 1], ids[index + 1]].filter(
    (id): id is string => id !== undefined,
  );
}
