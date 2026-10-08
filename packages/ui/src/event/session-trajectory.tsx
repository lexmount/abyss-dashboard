import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, ChevronUp, Search, X } from "lucide-react";
import * as React from "react";
import { cn } from "../utils";
import {
  fieldOccurrenceOffsets,
  highlightSegments,
  matchesByTurn,
  occurrencesOf,
  searchTrajectory,
  type SearchableField,
} from "./session-trajectory-search";

const ESTIMATED_ITEM_HEIGHT_PX = 72;
const ESTIMATED_EVENT_HEIGHT_PX = 240;
const VIRTUAL_OVERSCAN_ITEMS = 8;
const COLLAPSED_MAX_CHARACTERS = 600;
const COLLAPSED_MAX_LINES = 8;
const SEARCH_DEBOUNCE_MS = 150;

export type SessionTrajectoryItemKind =
  | "request"
  | "context"
  | "user"
  | "assistant"
  | "tool_call"
  | "tool_result"
  | "compaction";

/** One piece of new content contributed by one event. */
export interface SessionTrajectoryItem {
  kind: SessionTrajectoryItemKind;
  stream: number;
  turn_index: number;
  event_pk: string;
  observed_at: string;
  llm_model: string;
  text?: string;
  continued?: boolean;
  name?: string;
  call_id?: string;
  input?: string;
  output?: string;
  output_event_pk?: string;
}

/** One observed request or response, even when it adds no visible content. */
export interface SessionTrajectoryEvent {
  event_pk: string;
  turn_index: number;
  event_type: string;
  observed_at: string;
  llm_model: string;
  /** Uncached input; cache reads and writes are disjoint input counters. */
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  /** Included in output_tokens. */
  reasoning_tokens: number;
  total_tokens: number;
  token_usage_available: boolean;
  token_usage_estimated: boolean;
}

export interface SessionTrajectoryLabels {
  request: string;
  context: string;
  user: string;
  assistant: string;
  toolCall: string;
  toolResult: string;
  /** Context compaction: its summary prompt as `input`, the summary as `output`. */
  compaction: string;
  compactionPrompt: string;
  compactionSummary: string;
  input: string;
  output: string;
  noOutput: string;
  showMore: string;
  showLess: string;
  openEvent: string;
  turn: (index: number) => string;
  characters: (count: string) => string;
  summary: (items: string, toolCalls: string) => string;
  empty: string;
  allTurns: string;
  turnList: string;
  toolCount: (count: string) => string;
  toolsOnly: (names: string) => string;
  /** Placeholder and accessible name of the in-session search field. */
  search: string;
  /** Position among matching items, such as "3 / 17". */
  searchPosition: (current: string, total: string) => string;
  searchNoMatches: string;
  searchPrevious: string;
  searchNext: string;
  searchClear: string;
  /** Occurrences of the query in one turn, for the timeline. */
  searchTurnMatches: (count: string) => string;
  /** Labels for summaries of every observed request and response. */
  eventRequest: string;
  eventResponse: string;
  tokens: string;
  inputTokens: string;
  outputTokens: string;
  cacheReadTokens: string;
  cacheWriteTokens: string;
  reasoningTokens: string;
  estimatedTokens: string;
  tokensUnavailable: string;
  unknownModel: string;
  noNewContent: string;
}

export interface SessionTrajectoryProps {
  items: SessionTrajectoryItem[];
  /** Authoritative event order and usage, independent of merged content. */
  events?: SessionTrajectoryEvent[];
  /** Raw event opened in the inspector, or null. */
  selectedEventId: string | null;
  /** Selects an item's raw event; items from the same event highlight together. */
  onSelectEvent: (eventPk: string) => void;
  /** Raw event inspector, shown beside the content while an event is selected. */
  inspector?: React.ReactNode;
  /** Turn shown on its own, or null for the whole session. */
  focusedTurn: number | null;
  onFocusTurn: (turnIndex: number | null) => void;
  formatTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionTrajectoryLabels;
  className?: string;
  /**
   * Search text the view opens with, such as a term carried over from a
   * session search. It seeds the search box once; the first match inside
   * `focusedTurn`, when there is one, is brought into view.
   */
  initialQuery?: string;
  /** Reports the settled search text, so a caller can keep it in its URL. */
  onQueryChange?: (query: string) => void;
}

type TrajectoryRow =
  | { kind: "turn"; turnIndex: number; startedAt: string }
  | {
      kind: "event";
      event: SessionTrajectoryEvent;
      items: TrajectoryContentRow[];
    }
  | TrajectoryContentRow;

interface TrajectoryContentRow {
  kind: "item";
  item: DisplayTrajectoryItem;
  index: number;
}

interface DisplayTrajectoryItem extends SessionTrajectoryItem {
  contextEventIds?: string[];
  /** A paired output displayed under the event that actually carried it. */
  linkedOutput?: boolean;
  compactionPart?: "prompt" | "summary";
}

/** Keep tool results and compaction summaries inside their source events. */
function eventContent(
  items: readonly SessionTrajectoryItem[],
  events: readonly SessionTrajectoryEvent[],
): DisplayTrajectoryItem[] {
  const byEvent = new Map(events.map((event) => [event.event_pk, event]));
  const content: DisplayTrajectoryItem[] = [];
  for (const item of items) {
    const outputEvent = item.output_event_pk
      ? byEvent.get(item.output_event_pk)
      : undefined;
    if (
      (item.kind === "tool_call" || item.kind === "compaction") &&
      outputEvent &&
      outputEvent.event_pk !== item.event_pk
    ) {
      content.push({
        ...item,
        output: undefined,
        linkedOutput: true,
        ...(item.kind === "compaction" ? { compactionPart: "prompt" } : {}),
      });
      content.push({
        ...item,
        kind: item.kind === "tool_call" ? "tool_result" : "compaction",
        event_pk: outputEvent.event_pk,
        turn_index: outputEvent.turn_index,
        observed_at: outputEvent.observed_at,
        llm_model: outputEvent.llm_model,
        input: undefined,
        ...(item.kind === "compaction" ? { compactionPart: "summary" } : {}),
      });
    } else {
      content.push({ ...item });
    }
  }
  // Moving outputs forward also moves their search hits to the owning turn.
  const order = new Map(events.map((event, index) => [event.event_pk, index]));
  return content.sort(
    (left, right) =>
      (order.get(left.event_pk) ?? events.length) -
      (order.get(right.event_pk) ?? events.length),
  );
}

/** Group neighboring context messages while retaining their source events. */
function groupContexts(
  items: readonly DisplayTrajectoryItem[],
  keepEventBoundaries: boolean,
): DisplayTrajectoryItem[] {
  const grouped: DisplayTrajectoryItem[] = [];
  for (const item of items) {
    const previous = grouped.at(-1);
    if (
      item.kind === "context" &&
      previous?.kind === "context" &&
      item.turn_index === previous.turn_index &&
      item.stream === previous.stream &&
      (!keepEventBoundaries || item.event_pk === previous.event_pk)
    ) {
      previous.text = [previous.text, item.text]
        .filter((text) => text !== undefined && text !== "")
        .join("\n\n");
      previous.contextEventIds = [
        ...new Set([
          ...(previous.contextEventIds ?? [previous.event_pk]),
          item.event_pk,
        ]),
      ];
    } else {
      grouped.push({ ...item });
    }
  }
  return grouped;
}

/** One node of the turn timeline. */
export interface TrajectoryTurnSummary {
  turnIndex: number;
  startedAt: string;
  /** First user input of the turn, else its first assistant reply. */
  summary: string | null;
  /** Distinct tool names, used when the turn has no text. */
  toolNames: string[];
  toolCalls: number;
}

/** Summarizes each turn in session order. */
export function trajectoryTurnSummaries(
  items: readonly SessionTrajectoryItem[],
  events?: readonly SessionTrajectoryEvent[],
): TrajectoryTurnSummary[] {
  const turns: TrajectoryTurnSummary[] = [];
  const replies = new Map<number, string>();
  for (const item of items) {
    let turn = turns.at(-1);
    if (turn?.turnIndex !== item.turn_index) {
      turn = {
        turnIndex: item.turn_index,
        startedAt: item.observed_at,
        summary: null,
        toolNames: [],
        toolCalls: 0,
      };
      turns.push(turn);
    }
    if (item.kind === "user" && turn.summary === null && item.text?.trim()) {
      turn.summary = oneLine(item.text);
    } else if (item.kind === "assistant" && item.text?.trim()) {
      if (!replies.has(turn.turnIndex)) {
        replies.set(turn.turnIndex, oneLine(item.text));
      }
    } else if (item.kind === "tool_call" || item.kind === "tool_result") {
      if (item.kind === "tool_call") turn.toolCalls += 1;
      if (item.name && !turn.toolNames.includes(item.name)) {
        turn.toolNames.push(item.name);
      }
    } else if (item.kind === "compaction") {
      const summary = item.output ?? item.input;
      if (summary?.trim() && !replies.has(turn.turnIndex)) {
        replies.set(turn.turnIndex, oneLine(summary));
      }
    }
  }
  for (const turn of turns) {
    turn.summary ??= replies.get(turn.turnIndex) ?? null;
  }
  if (!events) {
    return turns;
  }
  const byTurn = new Map(turns.map((turn) => [turn.turnIndex, turn]));
  const ordered = new Map<number, TrajectoryTurnSummary>();
  for (const event of events) {
    if (!ordered.has(event.turn_index)) {
      ordered.set(event.turn_index, {
        ...(byTurn.get(event.turn_index) ?? {
          turnIndex: event.turn_index,
          summary: null,
          toolNames: [],
          toolCalls: 0,
        }),
        startedAt: event.observed_at,
      });
    }
  }
  return [...ordered.values()];
}

/** Inserts a turn header before the first item of each turn. */
export function trajectoryRows(
  items: readonly SessionTrajectoryItem[],
  onlyTurn: number | null = null,
  events?: readonly SessionTrajectoryEvent[],
): TrajectoryRow[] {
  const rows: TrajectoryRow[] = [];
  let turn: number | null = null;
  if (events) {
    const byEvent = new Map<
      string,
      Extract<TrajectoryRow, { kind: "item" }>[]
    >();
    items.forEach((item, index) => {
      const children = byEvent.get(item.event_pk) ?? [];
      children.push({ kind: "item", item, index });
      byEvent.set(item.event_pk, children);
    });
    for (const event of events) {
      if (onlyTurn !== null && event.turn_index !== onlyTurn) {
        continue;
      }
      if (event.turn_index !== turn) {
        turn = event.turn_index;
        rows.push({
          kind: "turn",
          turnIndex: turn,
          startedAt: event.observed_at,
        });
      }
      rows.push({
        kind: "event",
        event,
        items: byEvent.get(event.event_pk) ?? [],
      });
    }
    return rows;
  }
  items.forEach((item, index) => {
    if (onlyTurn !== null && item.turn_index !== onlyTurn) {
      return;
    }
    if (item.turn_index !== turn) {
      turn = item.turn_index;
      rows.push({
        kind: "turn",
        turnIndex: item.turn_index,
        startedAt: item.observed_at,
      });
    }
    rows.push({ kind: "item", item, index });
  });
  return rows;
}

/**
 * Merged session view: each request and response contributes only its new
 * content, so the conversation reads once from start to end.
 */
export function SessionTrajectory({
  items: sourceItems,
  events,
  selectedEventId,
  onSelectEvent,
  inspector,
  focusedTurn,
  onFocusTurn,
  formatTime,
  formatNumber,
  labels,
  className,
  initialQuery,
  onQueryChange,
}: SessionTrajectoryProps) {
  const items = React.useMemo(
    () =>
      groupContexts(
        events ? eventContent(sourceItems, events) : sourceItems,
        events !== undefined,
      ),
    [sourceItems, events],
  );
  const turns = React.useMemo(
    () => trajectoryTurnSummaries(items, events),
    [items, events],
  );
  const rows = React.useMemo(
    () => trajectoryRows(items, focusedTurn, events),
    [items, focusedTurn, events],
  );
  const counts = React.useMemo(() => {
    let itemCount = 0;
    let toolCalls = 0;
    for (const row of rows) {
      const content =
        row.kind === "item" ? [row] : row.kind === "event" ? row.items : [];
      itemCount += content.length;
      for (const child of content) {
        if (child.item.kind === "tool_call") {
          toolCalls += 1;
        }
      }
    }
    return { items: itemCount, toolCalls };
  }, [rows]);
  const [expanded, setExpanded] = React.useState<ReadonlySet<number>>(
    () => new Set(),
  );

  const [query, setQuery] = React.useState(initialQuery ?? "");
  const searchQuery = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
  // The settled text is reported only when it changes, not for the text the
  // view opened with.
  const reportQuery = React.useRef(onQueryChange);
  React.useEffect(() => {
    reportQuery.current = onQueryChange;
  });
  const reportedQuery = React.useRef(searchQuery);
  React.useEffect(() => {
    if (reportedQuery.current !== searchQuery) {
      reportedQuery.current = searchQuery;
      reportQuery.current?.(searchQuery);
    }
  }, [searchQuery]);
  const matches = React.useMemo(
    () => searchTrajectory(items, searchQuery),
    [items, searchQuery],
  );
  const turnMatches = React.useMemo(() => matchesByTurn(matches), [matches]);
  // While searching, every item with a hit opens, so scrolling through the
  // conversation shows the hits rather than collapsed one-line headers. The
  // reader can still close any of them.
  const hitItems = React.useMemo(
    () => new Set(matches.map((match) => match.itemIndex)),
    [matches],
  );
  const [closedHits, setClosedHits] = React.useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const isExpanded = (index: number) =>
    hitItems.has(index) ? !closedHits.has(index) : expanded.has(index);
  const toggle = (index: number) =>
    (hitItems.has(index) ? setClosedHits : setExpanded)((current) => {
      const next = new Set(current);
      if (!next.delete(index)) {
        next.add(index);
      }
      return next;
    });
  // Stepping moves through every occurrence, not every matching item, so a
  // long system prompt with several hits is visited hit by hit.
  const occurrences = React.useMemo(() => occurrencesOf(matches), [matches]);
  // A search the view opens with starts at its first occurrence in the turn
  // it was opened on, when that turn has one.
  const [activeMatch, setActiveMatch] = React.useState(() =>
    Math.max(
      focusedTurn === null
        ? -1
        : occurrences.findIndex((match) => match.turnIndex === focusedTurn),
      0,
    ),
  );
  const active = occurrences[activeMatch];
  // The active match is brought into view only when the reader asks for it:
  // a new query, stepping, or picking a turn that has matches. Browsing
  // other turns while a search is open leaves the view where they put it.
  const [revealRequest, setRevealRequest] = React.useState(0);
  const revealFrames = React.useRef<number[]>([]);
  React.useEffect(
    () => () =>
      revealFrames.current.forEach((frame) =>
        window.cancelAnimationFrame(frame),
      ),
    [],
  );
  const revealPending = React.useRef(false);
  const requestReveal = () => {
    revealPending.current = true;
    setRevealRequest((current) => current + 1);
  };
  const step = (delta: number) => {
    if (occurrences.length > 0) {
      setActiveMatch(
        (current) =>
          (current + delta + occurrences.length) % occurrences.length,
      );
      requestReveal();
    }
  };
  // A typed search starts over at the first occurrence; the one the view
  // opened with keeps the start chosen above. Comparing with the last search
  // rather than counting runs keeps this right when effects run twice.
  const startedQuery = React.useRef(searchQuery);
  React.useEffect(() => {
    if (startedQuery.current !== searchQuery) {
      startedQuery.current = searchQuery;
      setActiveMatch(0);
      setClosedHits(new Set());
    }
    if (searchQuery) {
      requestReveal();
    }
  }, [searchQuery]);
  const focusTurn = (turnIndex: number | null) => {
    if (turnIndex !== null) {
      const first = occurrences.findIndex(
        (match) => match.turnIndex === turnIndex,
      );
      if (first !== -1) {
        setActiveMatch(first);
        requestReveal();
      }
    }
    onFocusTurn(turnIndex);
  };

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [outputTarget, setOutputTarget] = React.useState<{
    eventPk: string;
    callId?: string;
  } | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      rows[index]?.kind === "event"
        ? ESTIMATED_EVENT_HEIGHT_PX
        : ESTIMATED_ITEM_HEIGHT_PX,
    getItemKey: (index) => {
      const row = rows[index];
      return row?.kind === "item"
        ? `item-${row.index}`
        : row?.kind === "event"
          ? `event-${row.event.event_pk}`
          : `turn-${row?.turnIndex ?? index}`;
    },
    overscan: VIRTUAL_OVERSCAN_ITEMS,
  });

  // A newly selected turn starts reading from its beginning.
  React.useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [focusedTurn, virtualizer]);

  React.useEffect(() => {
    if (!outputTarget) return;
    const event = events?.find(
      (event) => event.event_pk === outputTarget.eventPk,
    );
    if (!event) return;
    if (focusedTurn !== null && event.turn_index !== focusedTurn) {
      onFocusTurn(event.turn_index);
      return;
    }
    const rowIndex = rows.findIndex(
      (row) => row.kind === "event" && row.event.event_pk === event.event_pk,
    );
    if (rowIndex === -1) return;
    const outputIndex = items.findIndex(
      (item) =>
        item.event_pk === event.event_pk &&
        (item.kind === "tool_result" || item.compactionPart === "summary") &&
        item.call_id === outputTarget.callId,
    );
    if (outputIndex !== -1) {
      setExpanded((current) => new Set([...current, outputIndex]));
      setClosedHits((current) => {
        const next = new Set(current);
        next.delete(outputIndex);
        return next;
      });
    }
    setOutputTarget(null);
    virtualizer.scrollToIndex(rowIndex, { align: "center" });
    revealFrames.current.push(
      window.requestAnimationFrame(() => {
        virtualizer.scrollToIndex(rowIndex, { align: "center" });
        revealFrames.current.push(
          window.requestAnimationFrame(() => {
            const target = scrollRef.current?.querySelector<HTMLElement>(
              `[data-trajectory-item="${outputIndex}"]`,
            );
            if (target) {
              centerWithin(scrollRef.current, target);
              target.focus({ preventScroll: true });
            }
          }),
        );
      }),
    );
  }, [
    outputTarget,
    events,
    focusedTurn,
    onFocusTurn,
    rows,
    items,
    virtualizer,
  ]);

  // Reveal the active match: switch to its turn when another turn is shown,
  // expand it when collapsed, and center it in the list.
  React.useEffect(() => {
    if (!active || !revealPending.current) {
      return;
    }
    if (focusedTurn !== null && active.turnIndex !== focusedTurn) {
      onFocusTurn(active.turnIndex);
      return;
    }
    setClosedHits((current) => {
      if (!current.has(active.itemIndex)) {
        return current;
      }
      const next = new Set(current);
      next.delete(active.itemIndex);
      return next;
    });
    const rowIndex = rows.findIndex((row) =>
      row.kind === "item"
        ? row.index === active.itemIndex
        : row.kind === "event" &&
          row.items.some((child) => child.index === active.itemIndex),
    );
    if (rowIndex === -1) {
      return;
    }
    revealPending.current = false;
    virtualizer.scrollToIndex(rowIndex, { align: "center" });
    // Row heights settle after expansion; center again once measured, then
    // bring the occurrence itself into view, inside its own scroll box too.
    // The frames outlive this effect's reruns, which parents' inline
    // callbacks can cause on any render.
    revealFrames.current.forEach((frame) => window.cancelAnimationFrame(frame));
    revealFrames.current = [
      window.requestAnimationFrame(() => {
        virtualizer.scrollToIndex(rowIndex, { align: "center" });
        revealFrames.current.push(
          window.requestAnimationFrame(() => {
            const list = scrollRef.current;
            const mark = list?.querySelector<HTMLElement>(
              "[data-active-match]",
            );
            if (list && mark) {
              centerWithin(mark.closest("pre"), mark);
              centerWithin(list, mark);
            }
          }),
        );
      }),
    ];
  }, [active, focusedTurn, onFocusTurn, revealRequest, rows, virtualizer]);

  return (
    <div className="flex flex-col">
      {/* The search spans the whole session, so it sits above the turns and
          their details, and stays in view while the page scrolls. */}
      <div className="bg-background sticky top-0 z-20 pb-3">
        <TrajectorySearch
          query={query}
          onQueryChange={setQuery}
          position={active ? activeMatch + 1 : 0}
          total={occurrences.length}
          searching={query.trim() !== searchQuery}
          onStep={step}
          formatNumber={formatNumber}
          labels={labels}
        />
      </div>
      <div
        className={cn(
          "bg-card relative flex min-h-0 overflow-hidden rounded-xl border shadow-xs max-md:flex-col",
          className,
        )}
      >
        <TurnTimeline
          turns={turns}
          turnMatches={searchQuery ? turnMatches : null}
          focusedTurn={focusedTurn}
          onFocusTurn={focusTurn}
          formatTime={formatTime}
          formatNumber={formatNumber}
          labels={labels}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b px-4 py-2.5">
            <div className="min-w-0 truncate text-sm">
              <span className="font-medium">
                {focusedTurn === null
                  ? labels.allTurns
                  : labels.turn(focusedTurn)}
              </span>
              <span className="text-muted-foreground ml-2 text-xs">
                {labels.summary(
                  formatNumber(counts.items),
                  formatNumber(counts.toolCalls),
                )}
              </span>
            </div>
          </div>
          <div
            ref={scrollRef}
            data-trajectory-content=""
            className="min-h-0 flex-1 overflow-auto"
          >
            {rows.length === 0 ? (
              <div className="text-muted-foreground py-10 text-center text-sm">
                {labels.empty}
              </div>
            ) : (
              <div
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((virtual) => {
                  const row = rows[virtual.index];
                  if (!row) {
                    return null;
                  }
                  return (
                    <div
                      key={virtual.key}
                      data-index={virtual.index}
                      ref={virtualizer.measureElement}
                      className="absolute left-0 w-full"
                      // A real top offset lets sticky event headers follow the
                      // scroll container without overlapping their contents.
                      style={{ top: virtual.start }}
                    >
                      {row.kind === "turn" ? (
                        <div className="flex items-center gap-3 px-4 pt-5 pb-1.5 text-xs">
                          <span className="font-semibold">
                            {labels.turn(row.turnIndex)}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {formatTime(row.startedAt)}
                          </span>
                          <span aria-hidden className="bg-border h-px flex-1" />
                        </div>
                      ) : row.kind === "event" ? (
                        <div className="px-3 py-2 sm:px-4">
                          <section
                            aria-label={`${row.event.event_type === "request" ? labels.eventRequest : labels.eventResponse} · ${row.event.llm_model || labels.unknownModel} · ${formatTime(row.event.observed_at)}`}
                            data-trajectory-event={row.event.event_pk}
                            className={cn(
                              "bg-card overflow-clip rounded-xl border shadow-xs",
                              selectedEventId === row.event.event_pk &&
                                "ring-ring/60 ring-2",
                            )}
                          >
                            <TrajectoryEventRow
                              event={row.event}
                              selected={selectedEventId === row.event.event_pk}
                              onSelectEvent={onSelectEvent}
                              formatTime={formatTime}
                              formatNumber={formatNumber}
                              labels={labels}
                            />
                            {row.items.length === 0 ? (
                              <p className="text-muted-foreground px-4 py-3 text-xs">
                                {labels.noNewContent}
                              </p>
                            ) : (
                              <div className="px-2 py-2 sm:px-3">
                                <div className="border-border ml-1 space-y-1 border-l-2 py-1 pl-2 sm:pl-3">
                                  {row.items.map((child) => (
                                    <div
                                      key={child.index}
                                      data-trajectory-item={child.index}
                                      tabIndex={-1}
                                      className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      <TrajectoryItemRow
                                        item={child.item}
                                        query={searchQuery}
                                        activeOccurrence={
                                          active?.itemIndex === child.index
                                            ? active.occurrence
                                            : null
                                        }
                                        expanded={isExpanded(child.index)}
                                        selectedEventId={selectedEventId}
                                        onToggle={() => toggle(child.index)}
                                        onSelectEvent={onSelectEvent}
                                        onRevealOutput={(eventPk, callId) =>
                                          setOutputTarget({ eventPk, callId })
                                        }
                                        nested
                                        formatTime={formatTime}
                                        formatNumber={formatNumber}
                                        labels={labels}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </section>
                        </div>
                      ) : (
                        <TrajectoryItemRow
                          item={row.item}
                          query={searchQuery}
                          activeOccurrence={
                            active?.itemIndex === row.index
                              ? active.occurrence
                              : null
                          }
                          expanded={isExpanded(row.index)}
                          selectedEventId={selectedEventId}
                          onToggle={() => toggle(row.index)}
                          onSelectEvent={onSelectEvent}
                          formatTime={formatTime}
                          formatNumber={formatNumber}
                          labels={labels}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {inspector}
      </div>
    </div>
  );
}

/**
 * Vertical timeline threading every turn; selecting a node shows that turn.
 * The first node shows the whole session.
 */
function TurnTimeline({
  turns,
  turnMatches,
  focusedTurn,
  onFocusTurn,
  formatTime,
  formatNumber,
  labels,
}: {
  turns: TrajectoryTurnSummary[];
  /** Search occurrences per turn while searching, else null. */
  turnMatches: Map<number, number> | null;
  focusedTurn: number | null;
  onFocusTurn: (turnIndex: number | null) => void;
  formatTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionTrajectoryLabels;
}) {
  const nodes: (number | null)[] = [
    null,
    ...turns.map((turn) => turn.turnIndex),
  ];
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [focusedTurn]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowDown" || event.key === "j"
        ? 1
        : event.key === "ArrowUp" || event.key === "k"
          ? -1
          : 0;
    if (step === 0) {
      return;
    }
    const position = Math.max(0, nodes.indexOf(focusedTurn));
    const next = nodes[position + step];
    if (next !== undefined) {
      onFocusTurn(next);
    }
    event.preventDefault();
  };

  return (
    <div
      role="listbox"
      aria-label={labels.turnList}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="bg-muted/30 focus-visible:ring-ring/40 min-h-0 shrink-0 overflow-auto py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset max-md:max-h-56 max-md:border-b md:w-72 md:border-r"
    >
      <ol className="relative">
        <span
          aria-hidden
          className="bg-border absolute top-5 bottom-5 left-[1.3rem] z-[1] w-px"
        />
        {nodes.map((turnIndex) => {
          const turn =
            turnIndex === null
              ? undefined
              : turns.find((candidate) => candidate.turnIndex === turnIndex);
          const selected = turnIndex === focusedTurn;
          return (
            <li key={turnIndex ?? "all"}>
              <button
                ref={selected ? selectedRef : undefined}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onFocusTurn(turnIndex)}
                className={cn(
                  "relative mx-1.5 flex w-[calc(100%-0.75rem)] gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                  selected ? "bg-ring/10" : "hover:bg-muted/70",
                  // Turns without matches fade while searching.
                  turn &&
                    turnMatches &&
                    !turnMatches.has(turn.turnIndex) &&
                    "opacity-45",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "relative z-[2] mt-1 size-2.5 shrink-0 rounded-full border-2 transition-shadow",
                    selected
                      ? "border-ring bg-ring ring-ring/20 ring-4"
                      : "border-muted-foreground/40 bg-card",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2 text-xs">
                    <span
                      className={cn("font-medium", selected && "text-ring")}
                    >
                      {turn ? labels.turn(turn.turnIndex) : labels.allTurns}
                    </span>
                    {turn ? (
                      <span className="text-muted-foreground tabular-nums">
                        {formatTime(turn.startedAt)}
                      </span>
                    ) : null}
                    {turn && turnMatches ? (
                      turnMatches.has(turn.turnIndex) ? (
                        <span className="bg-ring/15 text-ring ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums">
                          {labels.searchTurnMatches(
                            formatNumber(turnMatches.get(turn.turnIndex) ?? 0),
                          )}
                        </span>
                      ) : null
                    ) : turn && turn.toolCalls > 0 ? (
                      <span className="bg-muted text-muted-foreground ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] tabular-nums">
                        {labels.toolCount(formatNumber(turn.toolCalls))}
                      </span>
                    ) : null}
                  </span>
                  {turn ? (
                    <span className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                      {turn.summary ??
                        (turn.toolNames.length > 0
                          ? labels.toolsOnly(turn.toolNames.join(", "))
                          : labels.noNewContent)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TrajectoryEventRow({
  event,
  selected,
  onSelectEvent,
  formatTime,
  formatNumber,
  labels,
}: {
  event: SessionTrajectoryEvent;
  selected: boolean;
  onSelectEvent: (eventPk: string) => void;
  formatTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionTrajectoryLabels;
}) {
  const input =
    event.input_tokens + event.cache_read_tokens + event.cache_write_tokens;
  const count = (value: number) =>
    `${event.token_usage_estimated ? "≈ " : ""}${formatNumber(value)}`;
  const breakdown = [
    ...(input > 0 || event.event_type === "request"
      ? [[labels.inputTokens, input] as const]
      : []),
    ...(event.output_tokens > 0 || event.event_type === "response"
      ? [[labels.outputTokens, event.output_tokens] as const]
      : []),
    ...(event.cache_read_tokens > 0
      ? [[labels.cacheReadTokens, event.cache_read_tokens] as const]
      : []),
    ...(event.cache_write_tokens > 0
      ? [[labels.cacheWriteTokens, event.cache_write_tokens] as const]
      : []),
    ...(event.reasoning_tokens > 0
      ? [[labels.reasoningTokens, event.reasoning_tokens] as const]
      : []),
  ];
  return (
    <div className="bg-card sticky top-0 z-10 border-b">
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelectEvent(event.event_pk)}
        className={cn(
          "bg-muted/40 hover:bg-muted/70 focus-visible:ring-ring flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset",
        )}
      >
        <span className="bg-background shrink-0 rounded border px-2 py-0.5 font-semibold">
          {event.event_type === "request"
            ? labels.eventRequest
            : labels.eventResponse}
        </span>
        <span className="min-w-0 font-mono font-medium [overflow-wrap:anywhere]">
          {event.llm_model || labels.unknownModel}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">
          {event.token_usage_available
            ? `${count(event.total_tokens)} ${labels.tokens}`
            : labels.tokensUnavailable}
        </span>
        {event.token_usage_available && event.token_usage_estimated ? (
          <span className="text-muted-foreground">
            {labels.estimatedTokens}
          </span>
        ) : null}
        <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
          {formatTime(event.observed_at)}
        </span>
        {event.token_usage_available ? (
          <span className="text-muted-foreground flex w-full flex-wrap gap-x-3 gap-y-1 tabular-nums">
            {breakdown.map(([label, value]) => (
              <span key={label}>
                {label} {count(value)}
              </span>
            ))}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function kindLabel(
  item: DisplayTrajectoryItem,
  labels: SessionTrajectoryLabels,
): string {
  switch (item.kind) {
    case "request":
      return labels.request;
    case "context":
      return labels.context;
    case "user":
      return labels.user;
    case "assistant":
      return labels.assistant;
    case "tool_call":
      return labels.toolCall;
    case "tool_result":
      return labels.toolResult;
    case "compaction":
      return item.compactionPart === "prompt"
        ? labels.compactionPrompt
        : item.compactionPart === "summary"
          ? labels.compactionSummary
          : labels.compaction;
  }
}

function isLong(text: string): boolean {
  return (
    text.length > COLLAPSED_MAX_CHARACTERS ||
    text.split("\n").length > COLLAPSED_MAX_LINES
  );
}

function TrajectoryItemRow({
  item,
  query,
  activeOccurrence,
  expanded,
  selectedEventId,
  onToggle,
  onSelectEvent,
  onRevealOutput,
  nested = false,
  formatTime,
  formatNumber,
  labels,
}: {
  item: DisplayTrajectoryItem;
  /** Active search text to highlight, or empty. */
  query: string;
  /** Which of this item's occurrences is being viewed, if any. */
  activeOccurrence: number | null;
  expanded: boolean;
  selectedEventId: string | null;
  onToggle: () => void;
  onSelectEvent: (eventPk: string) => void;
  onRevealOutput?: (eventPk: string, callId?: string) => void;
  nested?: boolean;
  formatTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionTrajectoryLabels;
}) {
  const tool = item.kind === "tool_call" || item.kind === "tool_result";
  const compaction = item.kind === "compaction";
  // Tools and compactions both pair an input with an output.
  const paired = tool || compaction;
  const text = item.text ?? "";
  // Context is the whole system prompt, so it starts collapsed like tools.
  const compact = paired || item.kind === "context" || item.kind === "request";
  const collapsible = compact || isLong(text);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  // A tool result usually arrives in a later request than its call.
  const resultEventPk =
    item.output_event_pk !== undefined && item.output_event_pk !== item.event_pk
      ? item.output_event_pk
      : null;
  const selected =
    item.event_pk === selectedEventId ||
    (selectedEventId !== null &&
      item.contextEventIds?.includes(selectedEventId)) ||
    (!nested && resultEventPk !== null && resultEventPk === selectedEventId);
  // The item selects its raw event; controls inside it act on their own.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  const toggle = (event: React.SyntheticEvent) => {
    stop(event);
    onToggle();
  };
  const selectable = {
    role: "button",
    tabIndex: 0,
    "aria-pressed": selected,
    onClick: () => onSelectEvent(item.event_pk),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.target === event.currentTarget && event.key === "Enter") {
        onSelectEvent(item.event_pk);
      }
    },
  } as const;
  const activeMatch = activeOccurrence !== null;
  // The active occurrence, relative to each field's own occurrences.
  const offsets = activeMatch ? fieldOccurrenceOffsets(item, query) : null;
  const activeIn = (field: SearchableField) =>
    offsets && activeOccurrence !== null
      ? activeOccurrence - offsets[field]
      : undefined;
  const selectedRing = activeMatch
    ? "ring-ring ring-2"
    : selected && "ring-ring/60 ring-2";

  const meta = (
    <>
      {paired && !item.linkedOutput ? (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {item.output === undefined
            ? labels.noOutput
            : labels.characters(formatNumber(item.output.length))}
        </span>
      ) : item.kind === "context" || item.kind === "request" ? (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {labels.characters(formatNumber(text.length))}
        </span>
      ) : null}
      {nested ? null : (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {formatTime(item.observed_at)}
        </span>
      )}
    </>
  );

  if (compact) {
    return (
      <div className={cn(nested ? "py-1" : "px-4 py-1")}>
        <div
          {...selectable}
          className={cn(
            "cursor-pointer rounded-lg border transition-colors outline-none",
            expanded ? "bg-card" : "bg-muted/30 hover:bg-muted/60",
            selectedRing,
          )}
        >
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 text-xs">
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? labels.showLess : labels.showMore}
              onClick={toggle}
              className="text-muted-foreground hover:text-foreground -m-1 rounded p-1"
            >
              <Chevron className="size-3.5 shrink-0" />
            </button>
            <span className="text-muted-foreground shrink-0">
              {kindLabel(item, labels)}
            </span>
            {item.name ? (
              <span className="shrink-0 font-medium">
                <Highlighted
                  text={item.name}
                  query={query}
                  active={activeIn("name")}
                />
              </span>
            ) : null}
            <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[11px]">
              {paired && !expanded ? (
                <Highlighted
                  text={oneLine(
                    (compaction ? item.output : item.input) ??
                      item.input ??
                      item.output ??
                      "",
                  )}
                  query={query}
                />
              ) : (
                ""
              )}
            </span>
            {meta}
            {item.linkedOutput && resultEventPk && onRevealOutput ? (
              <button
                type="button"
                onClick={(event) => {
                  stop(event);
                  onRevealOutput(resultEventPk, item.call_id);
                }}
                className="text-ring hover:underline"
              >
                {compaction ? labels.compactionSummary : labels.toolResult} →
              </button>
            ) : null}
          </div>
          {expanded ? (
            <div
              className="cursor-auto space-y-2 border-t p-2.5"
              onClick={stop}
            >
              {paired ? (
                <>
                  {item.input !== undefined ? (
                    <ContentBlock
                      label={
                        compaction ? labels.compactionPrompt : labels.input
                      }
                      text={item.input}
                      query={query}
                      active={activeIn("input")}
                    />
                  ) : null}
                  {item.linkedOutput ? null : (
                    <ContentBlock
                      label={
                        compaction ? labels.compactionSummary : labels.output
                      }
                      text={item.output ?? labels.noOutput}
                      query={query}
                      active={
                        item.output === undefined
                          ? undefined
                          : activeIn("output")
                      }
                      action={
                        resultEventPk !== null ? (
                          <button
                            type="button"
                            onClick={() => onSelectEvent(resultEventPk)}
                            className="hover:text-foreground normal-case underline-offset-2 hover:underline"
                          >
                            {labels.openEvent}
                          </button>
                        ) : null
                      }
                    />
                  )}
                </>
              ) : (
                <>
                  <SearchScrollBox
                    className="max-h-96 overflow-auto font-mono text-xs break-words whitespace-pre-wrap"
                    query={query}
                    active={activeIn("text")}
                  >
                    <Highlighted
                      text={text}
                      query={query}
                      active={activeIn("text")}
                    />
                  </SearchScrollBox>
                  {item.contextEventIds && item.contextEventIds.length > 1 ? (
                    <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                      {item.contextEventIds.map((id, index) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onSelectEvent(id)}
                          className="hover:text-foreground hover:underline"
                        >
                          {labels.openEvent} {formatNumber(index + 1)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const body = (
    <div
      className={cn(
        "text-sm leading-relaxed break-words whitespace-pre-wrap",
        collapsible && !expanded && "line-clamp-6",
      )}
    >
      {item.continued ? "…" : ""}
      <Highlighted text={text} query={query} active={activeIn("text")} />
    </div>
  );
  const more = collapsible ? (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={toggle}
      className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-0.5 text-xs"
    >
      <Chevron className="size-3.5" />
      {expanded ? labels.showLess : labels.showMore}
    </button>
  ) : null;

  if (item.kind === "user") {
    return (
      <div className={cn(nested ? "py-1" : "px-4 py-1.5")}>
        <div
          {...selectable}
          className={cn(
            "border-ring/20 bg-ring/[0.06] cursor-pointer rounded-lg border px-3.5 py-2.5 outline-none",
            selectedRing,
          )}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ring font-medium">
              {kindLabel(item, labels)}
            </span>
            <span className="min-w-0 flex-1" />
            {meta}
          </div>
          <div className="mt-1.5">{body}</div>
          {more}
        </div>
      </div>
    );
  }

  // Assistant replies read as plain prose with the time beside the first line.
  return (
    <div className={cn(nested ? "py-1" : "px-4 py-1")}>
      <div
        {...selectable}
        className={cn(
          "hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1 outline-none",
          selected && "bg-ring/[0.06]",
          selectedRing,
        )}
      >
        <div className="min-w-0 flex-1">
          {nested ? (
            <div className="text-muted-foreground mb-1.5 text-xs font-medium">
              {kindLabel(item, labels)}
            </div>
          ) : null}
          {body}
          {more}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5 text-xs">
          {meta}
        </div>
      </div>
    </div>
  );
}

function ContentBlock({
  label,
  text,
  query,
  active,
  action,
}: {
  label: string;
  text: string;
  query: string;
  /** Index of the occurrence being viewed within this text, if any. */
  active?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 overflow-hidden rounded-md border">
      <div className="text-muted-foreground flex items-center justify-between border-b px-3 py-1 text-[11px] font-medium tracking-wide uppercase">
        <span>{label}</span>
        {action}
      </div>
      <SearchScrollBox
        className="max-h-96 overflow-auto p-3 font-mono text-xs break-all whitespace-pre-wrap"
        query={query}
        active={active}
      >
        <Highlighted text={text} query={query} active={active} />
      </SearchScrollBox>
    </div>
  );
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Search field with the match position and previous / next controls. */
function TrajectorySearch({
  query,
  onQueryChange,
  position,
  total,
  searching,
  onStep,
  formatNumber,
  labels,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  position: number;
  total: number;
  searching: boolean;
  onStep: (delta: number) => void;
  formatNumber: (value: number) => string;
  labels: SessionTrajectoryLabels;
}) {
  const hasQuery = query.trim().length > 0;
  return (
    <div className="border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 bg-card flex h-8 w-full items-center gap-1.5 rounded-md border pr-1 pl-2.5 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]">
      <Search className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      <input
        value={query}
        placeholder={labels.search}
        aria-label={labels.search}
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape" && hasQuery) {
            event.preventDefault();
            onQueryChange("");
          }
        }}
      />
      {hasQuery ? (
        <>
          <span
            className={cn(
              "text-muted-foreground shrink-0 text-xs tabular-nums",
              searching && "opacity-50",
            )}
            aria-live="polite"
          >
            {total > 0
              ? labels.searchPosition(
                  formatNumber(position),
                  formatNumber(total),
                )
              : labels.searchNoMatches}
          </span>
          <SearchIconButton
            label={labels.searchPrevious}
            disabled={total === 0}
            onClick={() => onStep(-1)}
          >
            <ChevronUp className="size-3.5" />
          </SearchIconButton>
          <SearchIconButton
            label={labels.searchNext}
            disabled={total === 0}
            onClick={() => onStep(1)}
          >
            <ChevronDown className="size-3.5" />
          </SearchIconButton>
          <SearchIconButton
            label={labels.searchClear}
            onClick={() => onQueryChange("")}
          >
            <X className="size-3.5" />
          </SearchIconButton>
        </>
      ) : null}
    </div>
  );
}

function SearchIconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * Text with every occurrence of the query marked; the occurrence being
 * viewed is filled solid so it stands out among the others.
 */
function Highlighted({
  text,
  query,
  active,
}: {
  text: string;
  query: string;
  /** Index of the occurrence being viewed within this text, if any. */
  active?: number;
}) {
  if (!query) {
    return <>{text}</>;
  }
  const nodes: React.ReactNode[] = [];
  let occurrence = 0;
  for (const [index, segment] of highlightSegments(text, query).entries()) {
    if (!segment.match) {
      nodes.push(<React.Fragment key={index}>{segment.text}</React.Fragment>);
      continue;
    }
    const current = occurrence === active;
    occurrence += 1;
    nodes.push(
      <mark
        key={index}
        data-active-match={current ? "" : undefined}
        className={cn(
          "rounded-sm px-px",
          current ? "bg-ring text-background" : "bg-ring/25 text-foreground",
        )}
      >
        {segment.text}
      </mark>,
    );
  }
  return <>{nodes}</>;
}

/**
 * A scrolling text box that, while searching, opens on the hit being viewed
 * or else on its first hit, so hits deep in long text are not out of sight.
 */
function SearchScrollBox({
  className,
  query,
  active,
  children,
}: {
  className: string;
  query: string;
  active?: number;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLPreElement>(null);
  React.useLayoutEffect(() => {
    const box = ref.current;
    if (!box || !query) {
      return;
    }
    const target =
      box.querySelector<HTMLElement>("[data-active-match]") ??
      box.querySelector<HTMLElement>("mark");
    if (target) {
      centerWithin(box, target);
    }
  }, [query, active]);
  return (
    <pre ref={ref} className={className}>
      {children}
    </pre>
  );
}

/** Scrolls a box so the element sits in its middle, leaving other boxes. */
function centerWithin(box: HTMLElement | null, element: HTMLElement) {
  if (!box) {
    return;
  }
  const boxRect = box.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  box.scrollTop +=
    rect.top - boxRect.top - (box.clientHeight - rect.height) / 2;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
