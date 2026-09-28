import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, Copy, ImageIcon, X } from "lucide-react";
import * as React from "react";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { ToggleGroup, ToggleGroupItem } from "../components/toggle-group";
import { cn } from "../utils";
import { toolContentSegments, type ToolContentSegment } from "./event-content";
import {
  adjacentEventRowIndex,
  buildLedgerRows,
  isRequestEvent,
  requestNumbers,
  type SessionLedgerEvent,
  type SessionLedgerFilter,
  type SessionLedgerOutline,
  type SessionLedgerRow,
} from "./session-ledger-model";
import type { SessionImageAttachment } from "./session-timeline";

export * from "./session-ledger-model";

const TURN_ROW_HEIGHT_PX = 34;
const EVENT_ROW_HEIGHT_PX = 36;
const VIRTUAL_OVERSCAN_ROWS = 12;
const INSPECTOR_DEFAULT_WIDTH_PX = 520;
const INSPECTOR_MIN_WIDTH_PX = 320;
const INSPECTOR_MAX_WIDTH_PX = 900;
const LEDGER_MIN_WIDTH_PX = 280;
const INSPECTOR_RESIZE_STEP_PX = 16;

/**
 * Complete content of the selected event, loaded separately from the outline.
 * Any additional scalar fields are listed verbatim in the properties tab.
 */
export interface SessionLedgerEventDetail {
  id: string;
  text: string | null;
  metadata: unknown;
  attachments: SessionImageAttachment[];
}

export type SessionLedgerDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; event: SessionLedgerEventDetail };

export interface SessionLedgerLabels {
  all: string;
  request: string;
  response: string;
  requestNumber: (number: string) => string;
  turn: (index: number) => string;
  turnSummary: (events: string, input: string, output: string) => string;
  sessionSummary: (turns: string, events: string, requests: string) => string;
  collapseAll: string;
  expandAll: string;
  filter: string;
  noText: string;
  noTurns: string;
  characters: (count: string) => string;
  tokens: (count: string) => string;
  estimatedTokens: string;
  close: string;
  resize: string;
  loading: string;
  error: (message: string) => string;
  copy: string;
  tabContent: string;
  tabTools: string;
  tabAttachments: string;
  tabMetadata: string;
  tabProperties: string;
  noTools: string;
  toolCall: string;
  toolResult: string;
  callId: string;
  toolContentHidden: string;
  imageContentHidden: string;
  imageLabel: (index: number) => string;
  openImage: (label: string) => string;
}

export interface SessionLedgerProps {
  outline: SessionLedgerOutline;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  /** Detail of `selectedEventId`; ignored when nothing is selected. */
  detail: SessionLedgerDetailState;
  attachmentUrl: (attachmentId: string) => string;
  formatDateTime: (value: string) => string;
  formatTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionLedgerLabels;
  className?: string;
}

type InspectorTab =
  "content" | "tools" | "attachments" | "metadata" | "properties";

/**
 * Trajectory-style session view: a virtualized, turn-grouped event ledger and
 * a resizable inspector that shows one event's complete content.
 */
export function SessionLedger({
  outline,
  selectedEventId,
  onSelectEvent,
  detail,
  attachmentUrl,
  formatDateTime,
  formatTime,
  formatNumber,
  labels,
  className,
}: SessionLedgerProps) {
  const [filter, setFilter] = React.useState<SessionLedgerFilter>("all");
  const [collapsedTurns, setCollapsedTurns] = React.useState<
    ReadonlySet<number>
  >(() => new Set());
  const numbers = React.useMemo(
    () => requestNumbers(outline.turns),
    [outline.turns],
  );
  const rows = React.useMemo(
    () => buildLedgerRows(outline.turns, { filter, collapsedTurns, numbers }),
    [outline.turns, filter, collapsedTurns, numbers],
  );
  const eventCount = React.useMemo(
    () => outline.turns.reduce((sum, turn) => sum + turn.events.length, 0),
    [outline.turns],
  );
  const selected = React.useMemo(() => {
    if (selectedEventId === null) {
      return null;
    }
    for (const turn of outline.turns) {
      const event = turn.events.find((item) => item.id === selectedEventId);
      if (event) {
        return { event, turnIndex: turn.turn_index };
      }
    }
    return null;
  }, [outline.turns, selectedEventId]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      rows[index]?.kind === "turn" ? TURN_ROW_HEIGHT_PX : EVENT_ROW_HEIGHT_PX,
    getItemKey: (index) => rowKey(rows[index]),
    overscan: VIRTUAL_OVERSCAN_ROWS,
  });

  // Keep the selection visible after deep links, keyboard moves, and filters.
  React.useEffect(() => {
    if (selectedEventId === null) {
      return;
    }
    const index = rows.findIndex(
      (row) => row.kind === "event" && row.event.id === selectedEventId,
    );
    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: "auto" });
    }
  }, [rows, selectedEventId, virtualizer]);

  const toggleTurn = (turnIndex: number) => {
    setCollapsedTurns((current) => {
      const next = new Set(current);
      if (!next.delete(turnIndex)) {
        next.add(turnIndex);
      }
      return next;
    });
  };
  const allCollapsed =
    outline.turns.length > 0 && collapsedTurns.size === outline.turns.length;

  const onLedgerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowDown" || event.key === "j"
        ? 1
        : event.key === "ArrowUp" || event.key === "k"
          ? -1
          : null;
    if (step !== null) {
      const index = adjacentEventRowIndex(rows, selectedEventId, step);
      const row = index === null ? undefined : rows[index];
      if (row?.kind === "event") {
        onSelectEvent(row.event.id);
      }
      event.preventDefault();
    } else if (event.key === "Escape" && selectedEventId !== null) {
      onSelectEvent(null);
      event.preventDefault();
    }
  };

  const splitRef = React.useRef<HTMLDivElement>(null);
  const [inspectorWidth, setInspectorWidth] = React.useState(
    INSPECTOR_DEFAULT_WIDTH_PX,
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border-y",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2">
        <div className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {labels.sessionSummary(
            formatNumber(outline.turns.length),
            formatNumber(eventCount),
            formatNumber(numbers.size),
          )}
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          aria-label={labels.filter}
          onValueChange={(value) => {
            if (value) {
              setFilter(value as SessionLedgerFilter);
            }
          }}
        >
          <ToggleGroupItem value="all" className="px-3">
            {labels.all}
          </ToggleGroupItem>
          <ToggleGroupItem value="request" className="px-3">
            {labels.request}
          </ToggleGroupItem>
          <ToggleGroupItem value="response" className="px-3">
            {labels.response}
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setCollapsedTurns(
              allCollapsed
                ? new Set()
                : new Set(outline.turns.map((turn) => turn.turn_index)),
            )
          }
        >
          {allCollapsed ? labels.expandAll : labels.collapseAll}
        </Button>
      </div>

      <div ref={splitRef} className="relative flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          role="listbox"
          aria-label={labels.sessionSummary(
            formatNumber(outline.turns.length),
            formatNumber(eventCount),
            formatNumber(numbers.size),
          )}
          aria-activedescendant={
            selectedEventId ? ledgerRowId(selectedEventId) : undefined
          }
          tabIndex={0}
          onKeyDown={onLedgerKeyDown}
          className="@container min-w-0 flex-1 overflow-auto outline-none"
        >
          {rows.length === 0 ? (
            <div className="text-muted-foreground py-10 text-center text-sm">
              {labels.noTurns}
            </div>
          ) : (
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index];
                if (!row) {
                  return null;
                }
                return (
                  <div
                    key={item.key}
                    className="absolute top-0 left-0 w-full"
                    style={{
                      height: item.size,
                      transform: `translateY(${item.start}px)`,
                    }}
                  >
                    {row.kind === "turn" ? (
                      <TurnRow
                        row={row}
                        formatNumber={formatNumber}
                        formatTime={formatTime}
                        labels={labels}
                        onToggle={() => toggleTurn(row.turn.turn_index)}
                      />
                    ) : (
                      <EventRow
                        row={row}
                        selected={row.event.id === selectedEventId}
                        formatNumber={formatNumber}
                        formatTime={formatTime}
                        labels={labels}
                        onSelect={() => onSelectEvent(row.event.id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selected ? (
          <aside
            aria-label={labels.tabContent}
            className="bg-background flex min-w-0 flex-col max-lg:absolute max-lg:inset-0 max-lg:z-10 lg:relative lg:w-(--ledger-inspector-width) lg:shrink-0 lg:border-l"
            style={
              {
                "--ledger-inspector-width": `${inspectorWidth}px`,
              } as React.CSSProperties
            }
          >
            <InspectorResizeHandle
              label={labels.resize}
              width={inspectorWidth}
              splitRef={splitRef}
              onResize={setInspectorWidth}
            />
            <EventInspector
              key={selected.event.id}
              event={selected.event}
              turnIndex={selected.turnIndex}
              requestNumber={numbers.get(selected.event.id) ?? null}
              detail={detail}
              attachmentUrl={attachmentUrl}
              formatDateTime={formatDateTime}
              formatNumber={formatNumber}
              labels={labels}
              onClose={() => onSelectEvent(null)}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function rowKey(row: SessionLedgerRow | undefined): string {
  if (!row) {
    return "missing";
  }
  return row.kind === "turn"
    ? `turn-${row.turn.turn_index}`
    : `event-${row.event.id}`;
}

function ledgerRowId(eventId: string): string {
  return `session-ledger-event-${eventId}`;
}

/** Compact token or character count for dense ledger columns. */
function compactCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toString();
}

function TurnRow({
  row,
  formatNumber,
  formatTime,
  labels,
  onToggle,
}: {
  row: Extract<SessionLedgerRow, { kind: "turn" }>;
  formatNumber: (value: number) => string;
  formatTime: (value: string) => string;
  labels: SessionLedgerLabels;
  onToggle: () => void;
}) {
  const Icon = row.collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      aria-expanded={!row.collapsed}
      onClick={onToggle}
      className="bg-muted/60 hover:bg-muted flex h-full w-full items-center gap-2 border-b px-3 text-left text-xs"
    >
      <Icon className="text-muted-foreground size-3.5 shrink-0" />
      <span className="font-medium">{labels.turn(row.turn.turn_index)}</span>
      <span className="text-muted-foreground">
        {formatTime(row.turn.started_at)}
      </span>
      <span className="text-muted-foreground ml-auto truncate">
        {labels.turnSummary(
          formatNumber(row.totals.events),
          compactCount(row.totals.inputTokens),
          compactCount(row.totals.outputTokens),
        )}
      </span>
    </button>
  );
}

function EventRow({
  row,
  selected,
  formatNumber,
  formatTime,
  labels,
  onSelect,
}: {
  row: Extract<SessionLedgerRow, { kind: "event" }>;
  selected: boolean;
  formatNumber: (value: number) => string;
  formatTime: (value: string) => string;
  labels: SessionLedgerLabels;
  onSelect: () => void;
}) {
  const { event, requestNumber } = row;
  const request = isRequestEvent(event);
  const preview = event.preview?.replace(/\s+/g, " ").trim();
  // A request preview is the tail of its accumulated context.
  const previewText = preview
    ? request && event.text_chars > preview.length
      ? `…${preview}`
      : preview
    : null;

  return (
    <div
      id={ledgerRowId(event.id)}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "relative flex h-full cursor-pointer items-center gap-2 border-b px-3 text-xs",
        selected ? "bg-accent" : "hover:bg-muted/50",
      )}
    >
      {selected ? (
        <span className="bg-primary absolute inset-y-0 left-0 w-0.5" />
      ) : null}
      <span className="text-muted-foreground w-12 shrink-0 font-mono tabular-nums">
        {requestNumber === null
          ? "↳"
          : labels.requestNumber(formatNumber(requestNumber))}
      </span>
      <Badge
        variant={request ? "default" : "secondary"}
        className="w-[4.25rem] shrink-0 justify-center"
      >
        {request ? labels.request : labels.response}
      </Badge>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          previewText ? undefined : "text-muted-foreground italic",
        )}
        title={previewText ?? undefined}
      >
        {previewText ?? labels.noText}
        {event.attachment_count > 0 ? (
          <ImageIcon className="text-muted-foreground ml-1.5 inline size-3.5 align-[-2px]" />
        ) : null}
      </span>
      <span className="text-muted-foreground w-36 shrink-0 truncate @max-2xl:hidden">
        {event.llm_model}
      </span>
      <span
        className="text-muted-foreground w-[9.5rem] shrink-0 text-right tabular-nums"
        title={event.token_usage_estimated ? labels.estimatedTokens : undefined}
      >
        {event.token_usage_estimated ? "≈" : ""}
        {labels.tokens(compactCount(event.total_tokens))} ·{" "}
        {labels.characters(compactCount(event.text_chars))}
      </span>
      <span className="text-muted-foreground w-[5.5rem] shrink-0 text-right tabular-nums @max-xl:hidden">
        {formatTime(event.observed_at)}
      </span>
    </div>
  );
}

function InspectorResizeHandle({
  label,
  width,
  splitRef,
  onResize,
}: {
  label: string;
  width: number;
  splitRef: React.RefObject<HTMLDivElement | null>;
  onResize: (width: number) => void;
}) {
  const drag = React.useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const clamp = (value: number) => {
    const splitWidth = splitRef.current?.getBoundingClientRect().width ?? 0;
    const max = Math.min(
      INSPECTOR_MAX_WIDTH_PX,
      Math.max(INSPECTOR_MIN_WIDTH_PX, splitWidth - LEDGER_MIN_WIDTH_PX),
    );
    return Math.round(Math.min(max, Math.max(INSPECTOR_MIN_WIDTH_PX, value)));
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={width}
      tabIndex={0}
      className="hover:bg-primary/30 focus-visible:bg-primary/30 absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize max-lg:hidden"
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: width,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current?.pointerId !== event.pointerId) {
          return;
        }
        onResize(clamp(current.startWidth + current.startX - event.clientX));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId === event.pointerId) {
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => onResize(clamp(INSPECTOR_DEFAULT_WIDTH_PX))}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return;
        }
        const direction = event.key === "ArrowLeft" ? 1 : -1;
        onResize(clamp(width + direction * INSPECTOR_RESIZE_STEP_PX));
        event.preventDefault();
      }}
    />
  );
}

function EventInspector({
  event,
  turnIndex,
  requestNumber,
  detail,
  attachmentUrl,
  formatDateTime,
  formatNumber,
  labels,
  onClose,
}: {
  event: SessionLedgerEvent;
  turnIndex: number;
  requestNumber: number | null;
  detail: SessionLedgerDetailState;
  attachmentUrl: (attachmentId: string) => string;
  formatDateTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionLedgerLabels;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<InspectorTab>("content");
  const request = isRequestEvent(event);
  const ready = detail.status === "ready" ? detail.event : null;
  const segments = React.useMemo(
    () => (ready ? toolContentSegments(ready.metadata) : []),
    [ready],
  );
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: "content", label: labels.tabContent },
    {
      id: "tools",
      label: ready
        ? `${labels.tabTools} (${formatNumber(segments.length)})`
        : labels.tabTools,
    },
    ...(event.attachment_count > 0
      ? [
          {
            id: "attachments" as const,
            label: `${labels.tabAttachments} (${formatNumber(event.attachment_count)})`,
          },
        ]
      : []),
    { id: "metadata", label: labels.tabMetadata },
    { id: "properties", label: labels.tabProperties },
  ];

  return (
    <>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Badge variant={request ? "default" : "secondary"}>
          {request ? labels.request : labels.response}
        </Badge>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {requestNumber === null
              ? labels.turn(turnIndex)
              : `${labels.requestNumber(formatNumber(requestNumber))} · ${labels.turn(turnIndex)}`}
          </div>
          <div className="text-muted-foreground truncate text-xs">
            {event.llm_model} · {formatDateTime(event.observed_at)}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={labels.close}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b px-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-2.5 py-2 text-xs",
              tab === item.id
                ? "border-primary font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">
        {tab === "properties" ? (
          <PropertiesPanel
            event={event}
            detail={ready}
            formatNumber={formatNumber}
          />
        ) : detail.status === "loading" ? (
          <div className="text-muted-foreground p-4 text-sm">
            {labels.loading}
          </div>
        ) : detail.status === "error" ? (
          <div className="text-destructive p-4 text-sm">
            {labels.error(detail.message)}
          </div>
        ) : tab === "content" ? (
          <TextPanel text={detail.event.text} labels={labels} />
        ) : tab === "tools" ? (
          <ToolsPanel segments={segments} labels={labels} />
        ) : tab === "attachments" ? (
          <AttachmentsPanel
            attachments={detail.event.attachments}
            attachmentUrl={attachmentUrl}
            formatNumber={formatNumber}
            labels={labels}
          />
        ) : (
          <MetadataPanel metadata={detail.event.metadata} />
        )}
      </div>
    </>
  );
}

function TextPanel({
  text,
  labels,
}: {
  text: string | null;
  labels: SessionLedgerLabels;
}) {
  if (!text?.trim()) {
    return (
      <div className="text-muted-foreground p-4 text-sm italic">
        {labels.noText}
      </div>
    );
  }
  return (
    <div className="relative">
      <CopyButton text={text} label={labels.copy} />
      <pre className="p-3 pr-12 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <Button
      variant="outline"
      size="icon"
      className="bg-background absolute top-2 right-2 size-7"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
      }}
    >
      <Copy className="size-3.5" />
    </Button>
  );
}

function ToolsPanel({
  segments,
  labels,
}: {
  segments: ToolContentSegment[];
  labels: SessionLedgerLabels;
}) {
  if (segments.length === 0) {
    return (
      <div className="text-muted-foreground p-4 text-sm">{labels.noTools}</div>
    );
  }
  // Collapsed disclosures keep long accumulated tool histories cheap to render.
  return (
    <div className="space-y-2 p-3">
      {segments.map((segment, index) => (
        <details
          key={segment.itemId ?? segment.callId ?? `${segment.type}-${index}`}
          className="bg-muted/20 rounded-md border"
        >
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-xs">
            <Badge variant="outline">
              {segment.type === "tool_call"
                ? labels.toolCall
                : labels.toolResult}
            </Badge>
            {segment.name ? (
              <span className="font-medium">{segment.name}</span>
            ) : null}
            {segment.callId ? (
              <span className="text-muted-foreground font-mono">
                {labels.callId}: {segment.callId}
              </span>
            ) : null}
          </summary>
          <pre className="border-t p-3 font-mono text-xs break-all whitespace-pre-wrap">
            {segment.content ?? labels.toolContentHidden}
          </pre>
        </details>
      ))}
    </div>
  );
}

function AttachmentsPanel({
  attachments,
  attachmentUrl,
  formatNumber,
  labels,
}: {
  attachments: SessionImageAttachment[];
  attachmentUrl: (attachmentId: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionLedgerLabels;
}) {
  return (
    <div className="grid gap-3 p-3">
      {attachments.map((attachment) => {
        const imageLabel = labels.imageLabel(attachment.position + 1);
        const source = attachmentUrl(attachment.id);
        return (
          <div
            key={attachment.id}
            className="bg-muted/20 overflow-hidden rounded-md border"
          >
            <div className="text-muted-foreground flex items-center gap-2 border-b px-3 py-2 text-xs">
              <ImageIcon className="size-4" />
              <span>{imageLabel}</span>
              <span>{attachment.media_type}</span>
              <span>{formatNumber(attachment.byte_size)} B</span>
            </div>
            {attachment.content_available ? (
              <a
                className="flex min-h-32 items-center justify-center p-3"
                href={source}
                target="_blank"
                rel="noreferrer"
                aria-label={labels.openImage(imageLabel)}
              >
                <img
                  className="max-h-80 max-w-full rounded object-contain"
                  src={source}
                  alt={imageLabel}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              </a>
            ) : (
              <div className="text-muted-foreground p-4 text-center text-xs">
                {labels.imageContentHidden}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetadataPanel({ metadata }: { metadata: unknown }) {
  const json = React.useMemo(
    () => JSON.stringify(metadata, null, 2),
    [metadata],
  );
  return (
    <pre className="p-3 font-mono text-xs break-all whitespace-pre-wrap">
      {json}
    </pre>
  );
}

/**
 * Lists every scalar field of the event verbatim, so nothing the collector
 * recorded is hidden. Outline fields show while the full event loads.
 */
function PropertiesPanel({
  event,
  detail,
  formatNumber,
}: {
  event: SessionLedgerEvent;
  detail: SessionLedgerEventDetail | null;
  formatNumber: (value: number) => string;
}) {
  const fields = new Map<string, unknown>(Object.entries(event));
  if (detail) {
    for (const [key, value] of Object.entries(detail)) {
      fields.set(key, value);
    }
  }
  const rows = [...fields].filter(
    ([key, value]) =>
      !nonScalarFields.has(key) &&
      (value === null || typeof value !== "object"),
  );
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-1.5 p-4 text-xs">
      {rows.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="text-muted-foreground font-mono">{key}</dt>
          <dd className="font-mono break-all tabular-nums">
            {value === null || value === undefined
              ? "—"
              : typeof value === "number"
                ? formatNumber(value)
                : String(value)}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** Fields shown in their own tabs rather than as properties. */
const nonScalarFields = new Set(["text", "preview", "metadata", "attachments"]);
