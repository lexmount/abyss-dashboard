import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, ChevronUp, Search, X } from "lucide-react";
import * as React from "react";
import { cn } from "../utils";
import {
  highlightSegments,
  matchesByTurn,
  searchTrajectory,
} from "./session-trajectory-search";

const ESTIMATED_ITEM_HEIGHT_PX = 72;
const VIRTUAL_OVERSCAN_ITEMS = 8;
const COLLAPSED_MAX_CHARACTERS = 600;
const COLLAPSED_MAX_LINES = 8;
const SEARCH_DEBOUNCE_MS = 150;

export type SessionTrajectoryItemKind =
  "context" | "user" | "assistant" | "tool_call" | "tool_result" | "compaction";

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

export interface SessionTrajectoryLabels {
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
}

export interface SessionTrajectoryProps {
  items: SessionTrajectoryItem[];
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
}

type TrajectoryRow =
  | { kind: "turn"; turnIndex: number; startedAt: string }
  | { kind: "item"; item: DisplayTrajectoryItem; index: number };

interface DisplayTrajectoryItem extends SessionTrajectoryItem {
  contextEventIds?: string[];
}

/** Group neighboring context messages while retaining their source events. */
function groupContexts(
  items: readonly SessionTrajectoryItem[],
): DisplayTrajectoryItem[] {
  const grouped: DisplayTrajectoryItem[] = [];
  for (const item of items) {
    const previous = grouped.at(-1);
    if (
      item.kind === "context" &&
      previous?.kind === "context" &&
      item.turn_index === previous.turn_index &&
      item.stream === previous.stream
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
    } else if (item.kind === "tool_call") {
      turn.toolCalls += 1;
      if (item.name && !turn.toolNames.includes(item.name)) {
        turn.toolNames.push(item.name);
      }
    }
  }
  for (const turn of turns) {
    turn.summary ??= replies.get(turn.turnIndex) ?? null;
  }
  return turns;
}

/** Inserts a turn header before the first item of each turn. */
export function trajectoryRows(
  items: readonly SessionTrajectoryItem[],
  onlyTurn: number | null = null,
): TrajectoryRow[] {
  const rows: TrajectoryRow[] = [];
  let turn: number | null = null;
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
  selectedEventId,
  onSelectEvent,
  inspector,
  focusedTurn,
  onFocusTurn,
  formatTime,
  formatNumber,
  labels,
  className,
}: SessionTrajectoryProps) {
  const items = React.useMemo(() => groupContexts(sourceItems), [sourceItems]);
  const turns = React.useMemo(() => trajectoryTurnSummaries(items), [items]);
  const rows = React.useMemo(
    () => trajectoryRows(items, focusedTurn),
    [items, focusedTurn],
  );
  const counts = React.useMemo(() => {
    let itemCount = 0;
    let toolCalls = 0;
    for (const row of rows) {
      if (row.kind === "item") {
        itemCount += 1;
        if (row.item.kind === "tool_call") {
          toolCalls += 1;
        }
      }
    }
    return { items: itemCount, toolCalls };
  }, [rows]);
  const [expanded, setExpanded] = React.useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const toggle = (index: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(index)) {
        next.add(index);
      }
      return next;
    });

  const [query, setQuery] = React.useState("");
  const searchQuery = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
  const matches = React.useMemo(
    () => searchTrajectory(items, searchQuery),
    [items, searchQuery],
  );
  const turnMatches = React.useMemo(() => matchesByTurn(matches), [matches]);
  const [activeMatch, setActiveMatch] = React.useState(0);
  const active = matches[activeMatch];
  const step = (delta: number) => {
    if (matches.length > 0) {
      setActiveMatch(
        (current) => (current + delta + matches.length) % matches.length,
      );
    }
  };
  React.useEffect(() => {
    setActiveMatch(0);
  }, [searchQuery]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT_PX,
    getItemKey: (index) => {
      const row = rows[index];
      return row?.kind === "item"
        ? `item-${row.index}`
        : `turn-${row?.turnIndex ?? index}`;
    },
    overscan: VIRTUAL_OVERSCAN_ITEMS,
  });

  // A newly selected turn starts reading from its beginning.
  React.useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [focusedTurn, virtualizer]);

  // Reveal the active match: switch to its turn when another turn is shown,
  // expand it when collapsed, and center it in the list.
  React.useEffect(() => {
    if (!active) {
      return;
    }
    if (focusedTurn !== null && active.turnIndex !== focusedTurn) {
      onFocusTurn(active.turnIndex);
      return;
    }
    setExpanded((current) =>
      current.has(active.itemIndex)
        ? current
        : new Set(current).add(active.itemIndex),
    );
    const rowIndex = rows.findIndex(
      (row) => row.kind === "item" && row.index === active.itemIndex,
    );
    if (rowIndex === -1) {
      return;
    }
    virtualizer.scrollToIndex(rowIndex, { align: "center" });
    // Row heights settle after expansion; center again once measured.
    const frame = window.requestAnimationFrame(() =>
      virtualizer.scrollToIndex(rowIndex, { align: "center" }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [active, focusedTurn, onFocusTurn, rows, virtualizer]);

  return (
    <div
      className={cn(
        "bg-card relative flex min-h-0 overflow-hidden rounded-xl border shadow-xs max-md:flex-col",
        className,
      )}
    >
      <TurnTimeline
        search={
          <TrajectorySearch
            query={query}
            onQueryChange={setQuery}
            position={active ? activeMatch + 1 : 0}
            total={matches.length}
            searching={query.trim() !== searchQuery}
            onStep={step}
            formatNumber={formatNumber}
            labels={labels}
          />
        }
        turns={turns}
        turnMatches={searchQuery ? turnMatches : null}
        focusedTurn={focusedTurn}
        onFocusTurn={onFocusTurn}
        formatTime={formatTime}
        formatNumber={formatNumber}
        labels={labels}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-[53px] flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
          <div className="min-w-0 flex-1 truncate text-sm">
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
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtual.start}px)` }}
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
                    ) : (
                      <TrajectoryItemRow
                        item={row.item}
                        query={searchQuery}
                        activeMatch={active?.itemIndex === row.index}
                        expanded={expanded.has(row.index)}
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
  );
}

/**
 * Vertical timeline threading every turn; selecting a node shows that turn.
 * The first node shows the whole session.
 */
function TurnTimeline({
  search,
  turns,
  turnMatches,
  focusedTurn,
  onFocusTurn,
  formatTime,
  formatNumber,
  labels,
}: {
  /** Session-wide search, shown above the turns it marks. */
  search: React.ReactNode;
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
    <div className="bg-muted/30 flex min-h-0 shrink-0 flex-col max-md:max-h-72 max-md:border-b md:w-72 md:border-r">
      <div className="flex min-h-[53px] items-center border-b px-2.5">
        {search}
      </div>
      <div
        role="listbox"
        aria-label={labels.turnList}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="focus-visible:ring-ring/40 min-h-0 flex-1 overflow-auto py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset"
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
                              formatNumber(
                                turnMatches.get(turn.turnIndex) ?? 0,
                              ),
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
                          labels.toolsOnly(turn.toolNames.join(", "))}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function kindLabel(
  kind: SessionTrajectoryItemKind,
  labels: SessionTrajectoryLabels,
): string {
  switch (kind) {
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
      return labels.compaction;
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
  activeMatch,
  expanded,
  selectedEventId,
  onToggle,
  onSelectEvent,
  formatTime,
  formatNumber,
  labels,
}: {
  item: DisplayTrajectoryItem;
  /** Active search text to highlight, or empty. */
  query: string;
  /** Whether this item is the search match being viewed. */
  activeMatch: boolean;
  expanded: boolean;
  selectedEventId: string | null;
  onToggle: () => void;
  onSelectEvent: (eventPk: string) => void;
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
  const compact = paired || item.kind === "context";
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
    (resultEventPk !== null && resultEventPk === selectedEventId);
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
  const selectedRing = activeMatch
    ? "ring-ring ring-2"
    : selected && "ring-ring/60 ring-2";

  const meta = (
    <>
      {paired ? (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {item.output === undefined
            ? labels.noOutput
            : labels.characters(formatNumber(item.output.length))}
        </span>
      ) : item.kind === "context" ? (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {labels.characters(formatNumber(text.length))}
        </span>
      ) : null}
      <span className="text-muted-foreground shrink-0 tabular-nums">
        {formatTime(item.observed_at)}
      </span>
    </>
  );

  if (compact) {
    return (
      <div className="px-4 py-1">
        <div
          {...selectable}
          className={cn(
            "cursor-pointer rounded-lg border transition-colors outline-none",
            expanded ? "bg-card" : "bg-muted/30 hover:bg-muted/60",
            selectedRing,
          )}
        >
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
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
              {kindLabel(item.kind, labels)}
            </span>
            {item.name ? (
              <span className="shrink-0 font-medium">
                <Highlighted text={item.name} query={query} />
              </span>
            ) : null}
            <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[11px]">
              {paired ? (
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
                    />
                  ) : null}
                  <ContentBlock
                    label={
                      compaction ? labels.compactionSummary : labels.output
                    }
                    text={item.output ?? labels.noOutput}
                    query={query}
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
                </>
              ) : (
                <>
                  <pre className="max-h-96 overflow-auto font-mono text-xs break-words whitespace-pre-wrap">
                    <Highlighted text={text} query={query} />
                  </pre>
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
      <Highlighted text={text} query={query} />
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
      <div className="px-4 py-1.5">
        <div
          {...selectable}
          className={cn(
            "border-ring/20 bg-ring/[0.06] cursor-pointer rounded-lg border px-3.5 py-2.5 outline-none",
            selectedRing,
          )}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ring font-medium">
              {kindLabel(item.kind, labels)}
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
    <div className="px-4 py-1">
      <div
        {...selectable}
        className={cn(
          "hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1 outline-none",
          selected && "bg-ring/[0.06]",
          selectedRing,
        )}
      >
        <div className="min-w-0 flex-1">
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
  action,
}: {
  label: string;
  text: string;
  query: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 overflow-hidden rounded-md border">
      <div className="text-muted-foreground flex items-center justify-between border-b px-3 py-1 text-[11px] font-medium tracking-wide uppercase">
        <span>{label}</span>
        {action}
      </div>
      <pre className="max-h-96 overflow-auto p-3 font-mono text-xs break-all whitespace-pre-wrap">
        <Highlighted text={text} query={query} />
      </pre>
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

/** Text with every occurrence of the query marked. */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) {
    return <>{text}</>;
  }
  return (
    <>
      {highlightSegments(text, query).map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            className="bg-ring/25 text-foreground rounded-sm px-px"
          >
            {segment.text}
          </mark>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
