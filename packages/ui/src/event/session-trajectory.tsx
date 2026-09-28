import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import * as React from "react";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
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
  mainStream: string;
  allStreams: string;
  streamLabel: (stream: number) => string;
  summary: (items: string, toolCalls: string) => string;
  empty: string;
}

export interface SessionTrajectoryProps {
  items: SessionTrajectoryItem[];
  onOpenEvent: (eventPk: string) => void;
  formatTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionTrajectoryLabels;
  className?: string;
}

type TrajectoryRow =
  | { kind: "turn"; turnIndex: number; startedAt: string }
  | { kind: "item"; item: SessionTrajectoryItem; index: number };

/** Stream with the most items; side requests usually contribute far fewer. */
export function mainTrajectoryStream(
  items: readonly SessionTrajectoryItem[],
): number | null {
  const counts = new Map<number, number>();
  for (const item of items) {
    counts.set(item.stream, (counts.get(item.stream) ?? 0) + 1);
  }
  let main: number | null = null;
  for (const [stream, count] of counts) {
    if (main === null || count > (counts.get(main) ?? 0)) {
      main = stream;
    }
  }
  return main;
}

/** Inserts a turn header before the first item of each turn. */
export function trajectoryRows(
  items: readonly SessionTrajectoryItem[],
  stream: number | null,
): TrajectoryRow[] {
  const rows: TrajectoryRow[] = [];
  let turn: number | null = null;
  items.forEach((item, index) => {
    if (stream !== null && item.stream !== stream) {
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
  onOpenEvent,
  formatTime,
  formatNumber,
  labels,
  className,
}: SessionTrajectoryProps) {
  const main = React.useMemo(() => mainTrajectoryStream(items), [items]);
  const streamCount = React.useMemo(
    () => new Set(items.map((item) => item.stream)).size,
    [items],
  );
  const [showAllStreams, setShowAllStreams] = React.useState(false);
  const rows = React.useMemo(
    () => trajectoryRows(items, showAllStreams ? null : main),
    [items, main, showAllStreams],
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

  return (
    <div className={cn("flex min-h-0 flex-col border-y", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2">
        <div className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {labels.summary(
            formatNumber(counts.items),
            formatNumber(counts.toolCalls),
          )}
        </div>
        {streamCount > 1 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAllStreams((value) => !value)}
          >
            {showAllStreams ? labels.mainStream : labels.allStreams}
          </Button>
        ) : null}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
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
                    <div className="bg-muted/60 flex items-center gap-2 border-b px-3 py-1.5 text-xs">
                      <span className="font-medium">
                        {labels.turn(row.turnIndex)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatTime(row.startedAt)}
                      </span>
                    </div>
                  ) : (
                    <TrajectoryItemRow
                      item={row.item}
                      expanded={expanded.has(row.index)}
                      showStream={showAllStreams && row.item.stream !== main}
                      onToggle={() => toggle(row.index)}
                      onOpenEvent={onOpenEvent}
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
  showStream,
  onToggle,
  onOpenEvent,
  formatTime,
  formatNumber,
  labels,
}: {
  item: SessionTrajectoryItem;
  expanded: boolean;
  showStream: boolean;
  onToggle: () => void;
  onOpenEvent: (eventPk: string) => void;
  formatTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionTrajectoryLabels;
}) {
  const tool = item.kind === "tool_call" || item.kind === "tool_result";
  const text = item.text ?? "";
  // Context is the whole system prompt, so it starts collapsed like tools.
  const collapsible = tool || item.kind === "context" || isLong(text);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        "group border-b px-3 py-2 text-sm",
        item.kind === "user" && "bg-primary/5",
      )}
    >
      <div className="flex items-center gap-2 text-xs">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? labels.showLess : labels.showMore}
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground -ml-1"
          >
            <Chevron className="size-4" />
          </button>
        ) : (
          <span className="w-3" />
        )}
        <Badge
          variant={
            item.kind === "user" ? "default" : tool ? "outline" : "secondary"
          }
        >
          {kindLabel(item.kind, labels)}
        </Badge>
        {item.name ? <span className="font-medium">{item.name}</span> : null}
        {tool ? (
          <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono">
            {oneLine(item.input ?? item.output ?? "")}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {showStream ? (
          <span className="text-muted-foreground">
            {labels.streamLabel(item.stream)}
          </span>
        ) : null}
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
        <button
          type="button"
          title={labels.openEvent}
          aria-label={labels.openEvent}
          onClick={() => onOpenEvent(item.event_pk)}
          className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>

      {tool ? (
        expanded ? (
          <div className="mt-2 space-y-2">
            {item.input !== undefined ? (
              <ContentBlock label={labels.input} text={item.input} />
            ) : null}
            <ContentBlock
              label={labels.output}
              text={item.output ?? labels.noOutput}
            />
          </div>
        ) : null
      ) : item.kind === "context" && !expanded ? null : (
        <div
          className={cn(
            "mt-1.5 pl-5 break-words whitespace-pre-wrap",
            collapsible && !expanded && "line-clamp-6",
          )}
        >
          {item.continued ? "…" : ""}
          {text}
        </div>
      )}
      {collapsible && !tool && item.kind !== "context" ? (
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground mt-1 pl-5 text-xs"
        >
          {expanded ? labels.showLess : labels.showMore}
        </button>
      ) : null}
    </div>
  );
}

function ContentBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="bg-muted/40 rounded-md">
      <div className="text-muted-foreground border-b px-3 py-1 text-xs">
        {label}
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
