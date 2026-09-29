import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "../utils";

const ESTIMATED_ITEM_HEIGHT_PX = 72;
const VIRTUAL_OVERSCAN_ITEMS = 8;
const COLLAPSED_MAX_CHARACTERS = 600;
const COLLAPSED_MAX_LINES = 8;

export type SessionTrajectoryItemKind =
  "context" | "user" | "assistant" | "tool_call" | "tool_result";

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
  | { kind: "item"; item: SessionTrajectoryItem; index: number };

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
  items,
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

  return (
    <div
      className={cn(
        "bg-card relative flex min-h-0 overflow-hidden rounded-xl border shadow-xs max-md:flex-col",
        className,
      )}
    >
      <TurnTimeline
        turns={turns}
        focusedTurn={focusedTurn}
        onFocusTurn={onFocusTurn}
        formatTime={formatTime}
        formatNumber={formatNumber}
        labels={labels}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
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
  turns,
  focusedTurn,
  onFocusTurn,
  formatTime,
  formatNumber,
  labels,
}: {
  turns: TrajectoryTurnSummary[];
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
                    {turn && turn.toolCalls > 0 ? (
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
  expanded,
  selectedEventId,
  onToggle,
  onSelectEvent,
  formatTime,
  formatNumber,
  labels,
}: {
  item: SessionTrajectoryItem;
  expanded: boolean;
  selectedEventId: string | null;
  onToggle: () => void;
  onSelectEvent: (eventPk: string) => void;
  formatTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionTrajectoryLabels;
}) {
  const tool = item.kind === "tool_call" || item.kind === "tool_result";
  const text = item.text ?? "";
  // Context is the whole system prompt, so it starts collapsed like tools.
  const compact = tool || item.kind === "context";
  const collapsible = compact || isLong(text);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  // A tool result usually arrives in a later request than its call.
  const resultEventPk =
    item.output_event_pk !== undefined && item.output_event_pk !== item.event_pk
      ? item.output_event_pk
      : null;
  const selected =
    item.event_pk === selectedEventId ||
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
  const selectedRing = selected && "ring-ring/60 ring-2";

  const meta = (
    <>
      {tool ? (
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
              <span className="shrink-0 font-medium">{item.name}</span>
            ) : null}
            <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[11px]">
              {tool ? oneLine(item.input ?? item.output ?? "") : ""}
            </span>
            {meta}
          </div>
          {expanded ? (
            <div
              className="cursor-auto space-y-2 border-t p-2.5"
              onClick={stop}
            >
              {tool ? (
                <>
                  {item.input !== undefined ? (
                    <ContentBlock label={labels.input} text={item.input} />
                  ) : null}
                  <ContentBlock
                    label={labels.output}
                    text={item.output ?? labels.noOutput}
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
                <pre className="max-h-96 overflow-auto font-mono text-xs break-words whitespace-pre-wrap">
                  {text}
                </pre>
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
      {text}
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
  action,
}: {
  label: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 overflow-hidden rounded-md border">
      <div className="text-muted-foreground flex items-center justify-between border-b px-3 py-1 text-[11px] font-medium tracking-wide uppercase">
        <span>{label}</span>
        {action}
      </div>
      <pre className="max-h-96 overflow-auto p-3 font-mono text-xs break-all whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}
