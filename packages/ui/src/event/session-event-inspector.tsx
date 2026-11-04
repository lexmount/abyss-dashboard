import { Copy, ImageIcon, X } from "lucide-react";
import * as React from "react";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { cn } from "../utils";
import {
  conversationOf,
  leadingInstructionCount,
  type Conversation,
  type ConversationEntry,
} from "./event-content";

export interface SessionImageAttachment {
  id: string;
  position: number;
  media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  byte_size: number;
  sha256: string;
  content_available: boolean;
}

const INSPECTOR_DEFAULT_WIDTH_PX = 520;
const INSPECTOR_MIN_WIDTH_PX = 320;
const INSPECTOR_MAX_WIDTH_PX = 900;
const CONTENT_MIN_WIDTH_PX = 280;
const INSPECTOR_RESIZE_STEP_PX = 16;

/**
 * One HTTP header as the collector recorded it: `value` when the bytes were
 * UTF-8, otherwise `value_base64`.
 */
export type SessionEventHeader =
  { name: string; value: string } | { name: string; value_base64: string };

/** The token counters reported for one side of a call. */
export interface SessionEventTokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

/** One raw request or response event, grouped as the collector reported it. */
export interface SessionEventDetail {
  id: string;
  event_id: string;
  event_type: string;
  observed_at: string;
  agent: { name: string; version: string | null };
  device: {
    host_name: string | null;
    platform: string | null;
    os_version: string | null;
  };
  llm: { provider: string; model: string };
  purpose: string | null;
  declared: {
    subagent_id: string | null;
    parent_subagent_id: string | null;
    turn_id: string | null;
  };
  response_id: string | null;
  previous_response_id: string | null;
  http: { path: string | null; headers: SessionEventHeader[] };
  token_usage: SessionEventTokenUsage;
  omitted: string[];
  conversation?: unknown;
  attachments: SessionImageAttachment[];
}

export type SessionEventDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; event: SessionEventDetail };

export interface SessionEventInspectorLabels {
  title: string;
  request: string;
  response: string;
  close: string;
  resize: string;
  loading: string;
  error: (message: string) => string;
  copy: string;
  noText: string;
  tabContent: string;
  tabAttachments: string;
  tabRequestHeaders: string;
  tabResponseHeaders: string;
  tabProperties: string;
  toolCall: string;
  toolResult: string;
  callId: string;
  imageContentHidden: string;
  imageLabel: (index: number) => string;
  openImage: (label: string) => string;
  /** Marks a header value shown as base64 because it was not UTF-8. */
  base64: string;
  /** Switches the headers to their raw text, as recorded. */
  raw: string;
  roleSystem: string;
  roleDeveloper: string;
  roleUser: string;
  roleAssistant: string;
  roleReasoning: string;
  roleUnknown: string;
  /** The system and developer entries a conversation starts with. */
  systemPrompt: string;
  /** Expands a collapsed entry; `count` is its formatted length in characters. */
  showMore: (count: string) => string;
  showLess: string;
  /** Notes a conversation the collector could not decode completely. */
  incomplete: (completeness: string) => string;
  sectionCall: string;
  sectionUsage: string;
  sectionIdentity: string;
  sectionHttp: string;
  sectionDevice: string;
  agent: string;
  provider: string;
  model: string;
  purpose: string;
  omitted: string;
  inputTokens: string;
  cacheReadTokens: string;
  cacheWriteTokens: string;
  outputTokens: string;
  reasoningTokens: string;
  path: string;
  hostName: string;
  platform: string;
  osVersion: string;
}

/**
 * A tab the host adds after the content tab, such as what it worked out about
 * the event from the rest of the session.
 */
export interface SessionEventInspectorTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface SessionEventInspectorProps {
  detail: SessionEventDetailState;
  /** The panel's heading; `labels.title` when absent. */
  heading?: string;
  /** Tabs shown right after the content tab. */
  extraTabs?: readonly SessionEventInspectorTab[];
  /**
   * Host-provided properties, such as where the event stands in the session,
   * shown after the recorded ones; `EventPropertySection` matches their look.
   */
  properties?: React.ReactNode;
  /**
   * An entry of the event's conversation the reader chose, by its index: the
   * content tab opens scrolled to it, whole and marked. `request` is new each
   * time the reader chooses, so choosing the same entry again goes back to it.
   */
  focusEntry?: { index: number; request: number } | null;
  /**
   * `panel` (default) is a resizable side panel with its own header and close
   * button. `embedded` shows only the tabs, for a host that already shows the
   * event's side, model, and time, such as a card in a list.
   */
  variant?: "panel" | "embedded";
  /** Shows a close button in the panel header. */
  onClose?: () => void;
  attachmentUrl: (attachmentId: string) => string;
  formatDateTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionEventInspectorLabels;
  className?: string;
}

/** One raw event with every recorded field, as a side panel or embedded. */
export function SessionEventInspector({
  detail,
  heading,
  extraTabs = [],
  properties,
  focusEntry = null,
  variant = "panel",
  onClose,
  attachmentUrl,
  formatDateTime,
  formatNumber,
  labels,
  className,
}: SessionEventInspectorProps) {
  const [width, setWidth] = React.useState(INSPECTOR_DEFAULT_WIDTH_PX);
  // The tab chosen last stays as the panel shows other events.
  const [chosenTab, setTab] = React.useState("content");
  // Choosing an entry shows it, in the content tab.
  const focusRequest = focusEntry?.request;
  React.useEffect(() => {
    if (focusRequest !== undefined) {
      setTab("content");
    }
  }, [focusRequest]);
  const event = detail.status === "ready" ? detail.event : null;
  const headers = event?.http.headers ?? [];
  const conversation = React.useMemo(
    () => (event ? conversationOf(event.conversation) : null),
    [event],
  );
  const request = event?.event_type === "request";
  const tabs: { id: string; label: string }[] = [
    { id: "content", label: labels.tabContent },
    ...extraTabs.map(({ id, label }) => ({ id: extraTabId(id), label })),
    ...(event && event.attachments.length > 0
      ? [
          {
            id: "attachments" as const,
            label: `${labels.tabAttachments} (${formatNumber(event.attachments.length)})`,
          },
        ]
      : []),
    ...(headers.length > 0
      ? [
          {
            id: "headers" as const,
            label: `${request ? labels.tabRequestHeaders : labels.tabResponseHeaders} (${formatNumber(headers.length)})`,
          },
        ]
      : []),
    { id: "properties", label: labels.tabProperties },
  ];
  // A tab the shown event does not have, such as attachments chosen on an
  // earlier event, shows the content instead.
  const tab = tabs.some((item) => item.id === chosenTab)
    ? chosenTab
    : "content";
  const extraTab = extraTabs.find(({ id }) => extraTabId(id) === tab);

  const embedded = variant === "embedded";
  const tabList = (
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
  );
  const tabPanel = (
    <div
      // Another event starts at the top of its tab.
      key={event?.id}
      role="tabpanel"
      // Embedded, a long body scrolls inside its own box so a list of events
      // keeps a bounded height per event.
      className={cn(
        "overflow-auto",
        embedded ? "max-h-[70vh]" : "min-h-0 flex-1",
      )}
    >
      {extraTab ? (
        extraTab.content
      ) : detail.status === "loading" ? (
        <div className="text-muted-foreground p-4 text-sm">
          {labels.loading}
        </div>
      ) : detail.status === "error" ? (
        <div className="text-destructive p-4 text-sm">
          {labels.error(detail.message)}
        </div>
      ) : tab === "content" ? (
        conversation ? (
          <ConversationPanel
            conversation={conversation}
            focusEntry={focusEntry}
            formatNumber={formatNumber}
            labels={labels}
          />
        ) : (
          <div className="text-muted-foreground p-4 text-sm italic">
            {labels.noText}
          </div>
        )
      ) : tab === "attachments" ? (
        <AttachmentsPanel
          attachments={detail.event.attachments}
          attachmentUrl={attachmentUrl}
          formatNumber={formatNumber}
          labels={labels}
        />
      ) : tab === "headers" ? (
        <HeadersPanel headers={headers} labels={labels} />
      ) : (
        <>
          <PropertiesPanel
            event={detail.event}
            formatNumber={formatNumber}
            labels={labels}
          />
          {properties}
        </>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className={cn("flex min-w-0 flex-col", className)}>
        {tabList}
        {tabPanel}
      </div>
    );
  }

  return (
    <aside
      aria-label={labels.title}
      className={cn(
        "bg-background flex min-w-0 flex-col max-lg:absolute max-lg:inset-0 max-lg:z-10 lg:relative lg:w-(--event-inspector-width) lg:shrink lg:border-l",
        className,
      )}
      style={{ "--event-inspector-width": `${width}px` } as React.CSSProperties}
    >
      <ResizeHandle label={labels.resize} width={width} onResize={setWidth} />
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {event ? (
          <Badge variant={request ? "default" : "secondary"}>
            {request ? labels.request : labels.response}
          </Badge>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {heading ?? labels.title}
          </div>
          {event ? (
            <div className="text-muted-foreground truncate text-xs">
              {event.llm.model} · {formatDateTime(event.observed_at)}
            </div>
          ) : null}
        </div>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={labels.close}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
      {tabList}
      {tabPanel}
    </aside>
  );
}

/** A host's tab id, apart from the built-in ones. */
function extraTabId(id: string): string {
  return `extra:${id}`;
}

function ResizeHandle({
  label,
  width,
  onResize,
}: {
  label: string;
  width: number;
  onResize: (width: number) => void;
}) {
  const drag = React.useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    maxWidth: number;
  } | null>(null);
  const clamp = (value: number, maxWidth: number) =>
    Math.round(Math.min(maxWidth, Math.max(INSPECTOR_MIN_WIDTH_PX, value)));
  const maxWidthOf = (element: HTMLElement) => {
    const container = element.parentElement?.parentElement;
    const available =
      (container?.getBoundingClientRect().width ?? 0) - CONTENT_MIN_WIDTH_PX;
    return Math.min(
      INSPECTOR_MAX_WIDTH_PX,
      Math.max(INSPECTOR_MIN_WIDTH_PX, available),
    );
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
          maxWidth: maxWidthOf(event.currentTarget),
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current?.pointerId !== event.pointerId) {
          return;
        }
        onResize(
          clamp(
            current.startWidth + current.startX - event.clientX,
            current.maxWidth,
          ),
        );
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
      onDoubleClick={(event) =>
        onResize(
          clamp(INSPECTOR_DEFAULT_WIDTH_PX, maxWidthOf(event.currentTarget)),
        )
      }
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return;
        }
        const direction = event.key === "ArrowLeft" ? 1 : -1;
        onResize(
          clamp(
            width + direction * INSPECTOR_RESIZE_STEP_PX,
            maxWidthOf(event.currentTarget),
          ),
        );
        event.preventDefault();
      }}
    />
  );
}

/** Characters and lines an entry shows before "show more". */
const ENTRY_PREVIEW_CHARS = 1000;
const ENTRY_PREVIEW_LINES = 20;

/** The start of a long text, or null when the whole text is short enough. */
function entryPreview(text: string): string | null {
  let end = Math.min(text.length, ENTRY_PREVIEW_CHARS);
  let lines = 1;
  for (let index = 0; index < end; index += 1) {
    if (text.charCodeAt(index) === 10 && ++lines > ENTRY_PREVIEW_LINES) {
      end = index;
      break;
    }
  }
  return end < text.length ? text.slice(0, end) : null;
}

/** The conversation's entries in recorded order, one per protocol block. */
function ConversationPanel({
  conversation,
  focusEntry,
  formatNumber,
  labels,
}: {
  conversation: Conversation;
  focusEntry: { index: number; request: number } | null;
  formatNumber: (value: number) => string;
  labels: SessionEventInspectorLabels;
}) {
  const { entries, completeness } = conversation;
  const instructions = leadingInstructionCount(entries);
  const copyText = entries.map((entry) => entry.text).join("\n\n");
  return (
    <div className="relative">
      {copyText.trim() ? (
        <CopyButton text={copyText} label={labels.copy} />
      ) : null}
      {completeness !== null && completeness !== "complete" ? (
        <div className="text-muted-foreground px-3 pt-3 pr-12 text-xs">
          {labels.incomplete(completeness)}
        </div>
      ) : null}
      {entries.length === 0 ? (
        <div className="text-muted-foreground p-4 text-sm italic">
          {labels.noText}
        </div>
      ) : (
        <ol className="divide-y">
          {entries.map((entry, index) => (
            <ConversationEntryItem
              key={index}
              entry={entry}
              instruction={index < instructions}
              focusRequest={
                focusEntry?.index === index ? focusEntry.request : null
              }
              formatNumber={formatNumber}
              labels={labels}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function ConversationEntryItem({
  entry,
  instruction,
  focusRequest,
  formatNumber,
  labels,
}: {
  entry: ConversationEntry;
  /** Part of the system prompt the conversation starts with. */
  instruction: boolean;
  /** The reader's latest choice of this entry, or null when not chosen. */
  focusRequest: number | null;
  formatNumber: (value: number) => string;
  labels: SessionEventInspectorLabels;
}) {
  const [expanded, setExpanded] = React.useState(focusRequest !== null);
  const preview = React.useMemo(() => entryPreview(entry.text), [entry.text]);
  const tool = entry.role === "tool_call" || entry.role === "tool_result";
  const ref = React.useRef<HTMLLIElement>(null);
  // A chosen entry opens whole and comes to the top of the tab, which
  // scrolls on its own; the page stays where it is.
  React.useLayoutEffect(() => {
    const item = ref.current;
    if (focusRequest === null || !item) {
      return;
    }
    setExpanded(true);
    const panel = item.closest<HTMLElement>("[role=tabpanel]");
    if (panel) {
      panel.scrollTop +=
        item.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    }
  }, [focusRequest]);
  return (
    <li
      ref={ref}
      data-focused={focusRequest !== null || undefined}
      className={cn(
        "px-3 py-2",
        focusRequest !== null &&
          "bg-ring/5 shadow-[inset_3px_0_0_var(--color-ring)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 pr-10 text-xs">
        <Badge variant={instruction ? "secondary" : "outline"}>
          {entryLabel(entry.role, instruction, labels)}
        </Badge>
        {entry.name !== null ? (
          <span className="font-medium">{entry.name}</span>
        ) : null}
        {entry.callId !== null ? (
          <span className="text-muted-foreground font-mono">
            {labels.callId}: {entry.callId}
          </span>
        ) : null}
      </div>
      {entry.text ? (
        <>
          <pre
            className={cn(
              "mt-1.5 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap",
              tool && "bg-muted/30 rounded-md border p-2",
            )}
          >
            {preview !== null && !expanded ? `${preview}…` : entry.text}
          </pre>
          {preview !== null ? (
            <button
              type="button"
              className="text-ring mt-1 text-xs underline-offset-4 hover:underline"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded
                ? labels.showLess
                : labels.showMore(formatNumber(entry.text.length))}
            </button>
          ) : null}
        </>
      ) : (
        <div className="text-muted-foreground mt-1 text-xs italic">
          {labels.noText}
        </div>
      )}
    </li>
  );
}

function entryLabel(
  role: string,
  instruction: boolean,
  labels: SessionEventInspectorLabels,
): string {
  if (instruction) {
    return role === "developer"
      ? `${labels.systemPrompt} · ${labels.roleDeveloper}`
      : labels.systemPrompt;
  }
  switch (role) {
    case "system":
      return labels.roleSystem;
    case "developer":
      return labels.roleDeveloper;
    case "user":
      return labels.roleUser;
    case "assistant":
      return labels.roleAssistant;
    case "reasoning":
      return labels.roleReasoning;
    case "tool_call":
      return labels.toolCall;
    case "tool_result":
      return labels.toolResult;
    case "unknown":
      return labels.roleUnknown;
    default:
      return role;
  }
}

function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("bg-background absolute top-2 right-2 size-7", className)}
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

function AttachmentsPanel({
  attachments,
  attachmentUrl,
  formatNumber,
  labels,
}: {
  attachments: SessionImageAttachment[];
  attachmentUrl: (attachmentId: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionEventInspectorLabels;
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

/**
 * Headers as the browser's developer tools show them: a name column and a
 * value column, sorted by name with duplicates kept in recorded order; or,
 * raw, one `name: value` line each exactly in recorded order.
 */
function HeadersPanel({
  headers,
  labels,
}: {
  headers: SessionEventHeader[];
  labels: SessionEventInspectorLabels;
}) {
  const [raw, setRaw] = React.useState(false);
  // Header names cannot contain spaces or parentheses, so the copied marker
  // cannot be mistaken for part of a name.
  const text = headers
    .map((header) =>
      "value" in header
        ? `${header.name}: ${header.value}`
        : `${header.name} (base64): ${header.value_base64}`,
    )
    .join("\n");
  const sorted = React.useMemo(
    () =>
      headers
        .map((header, index) => ({ header, index }))
        .sort(
          (a, b) =>
            a.header.name.localeCompare(b.header.name) || a.index - b.index,
        ),
    [headers],
  );
  return (
    <div>
      <PanelToolbar raw={raw} onRaw={setRaw} copyText={text} labels={labels} />
      {raw ? (
        <pre className="p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
          {text}
        </pre>
      ) : (
        <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] text-xs">
          {sorted.map(({ header, index }) => (
            <div
              key={index}
              className="hover:bg-muted/50 col-span-2 grid grid-cols-subgrid gap-x-4 px-3 py-1"
            >
              <dt className="text-muted-foreground font-medium break-all">
                {header.name}
              </dt>
              <dd className="font-mono break-all whitespace-pre-wrap">
                {"value" in header ? (
                  header.value === "<redacted>" ? (
                    <span className="text-muted-foreground italic">
                      {header.value}
                    </span>
                  ) : (
                    header.value
                  )
                ) : (
                  <>
                    {header.value_base64}{" "}
                    <Badge
                      variant="outline"
                      className="px-1 py-0 align-middle font-sans text-[10px]"
                    >
                      {labels.base64}
                    </Badge>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** A tab's bar: the raw switch and a copy of the raw text. */
function PanelToolbar({
  raw,
  onRaw,
  copyText,
  labels,
}: {
  raw: boolean;
  onRaw: (raw: boolean) => void;
  copyText: string;
  labels: SessionEventInspectorLabels;
}) {
  return (
    <div className="bg-background sticky top-0 z-10 flex items-center justify-end gap-3 border-b px-3 py-1.5">
      <label className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 text-xs select-none">
        <input
          type="checkbox"
          checked={raw}
          onChange={(event) => onRaw(event.target.checked)}
          className="accent-primary size-3.5"
        />
        {labels.raw}
      </label>
      <CopyButton text={copyText} label={labels.copy} className="static" />
    </div>
  );
}

/** One row of a properties section: a label and the value it names. */
export interface EventPropertyRow {
  label: string;
  value: React.ReactNode;
  /** Shows the value as an identifier, in a monospace face. */
  mono?: boolean;
}

/**
 * A titled group of properties, listing only the rows given; nothing when
 * there are none.
 */
export function EventPropertySection({
  title,
  rows,
}: {
  title: string;
  rows: readonly EventPropertyRow[];
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="border-b px-4 py-3 last:border-b-0">
      <h3 className="text-muted-foreground mb-1.5 text-[11px] font-medium">
        {title}
      </h3>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-xs">
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "min-w-0 break-all tabular-nums",
                row.mono && "font-mono",
              )}
            >
              {row.value}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

/** Counters a request carries; the others belong to its response. */
const requestCounters = new Set<keyof SessionEventTokenUsage>([
  "input_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
]);
const responseCounters = new Set<keyof SessionEventTokenUsage>([
  "output_tokens",
  "reasoning_tokens",
]);

/**
 * What the collector reported about the call, in groups, what the page shows
 * nowhere else first; each group lists only what the event has. A side shows its own token counters, and a
 * counter of the other side only when it is not zero.
 */
function PropertiesPanel({
  event,
  formatNumber,
  labels,
}: {
  event: SessionEventDetail;
  formatNumber: (value: number) => string;
  labels: SessionEventInspectorLabels;
}) {
  const present = (rows: EventPropertyRow[]) =>
    rows.filter((row) => row.value !== null && row.value !== undefined);
  const own =
    event.event_type === "request" ? requestCounters : responseCounters;
  const counters: [keyof SessionEventTokenUsage, string][] = [
    ["input_tokens", labels.inputTokens],
    ["cache_read_tokens", labels.cacheReadTokens],
    ["cache_write_tokens", labels.cacheWriteTokens],
    ["output_tokens", labels.outputTokens],
    ["reasoning_tokens", labels.reasoningTokens],
  ];
  // The counters already add up to the event's total, and output includes
  // reasoning, so neither total is listed again.
  const usage: EventPropertyRow[] = counters
    .filter(([key]) => own.has(key) || event.token_usage[key] !== 0)
    .map(([key, label]) => ({
      label,
      value: formatNumber(event.token_usage[key]),
    }));
  const { agent, llm, device, declared } = event;
  return (
    <>
      <EventPropertySection
        title={labels.sectionHttp}
        rows={present([
          { label: labels.path, value: event.http.path, mono: true },
        ])}
      />
      <EventPropertySection
        title={labels.sectionCall}
        rows={present([
          { label: labels.purpose, value: event.purpose, mono: true },
          {
            label: labels.omitted,
            value: event.omitted.length > 0 ? event.omitted.join(", ") : null,
            mono: true,
          },
          { label: labels.provider, value: llm.provider },
          { label: labels.model, value: llm.model, mono: true },
          {
            label: labels.agent,
            value: agent.version
              ? `${agent.name} ${agent.version}`
              : agent.name,
          },
        ])}
      />
      <EventPropertySection title={labels.sectionUsage} rows={usage} />
      <EventPropertySection
        title={labels.sectionIdentity}
        rows={present(
          (
            [
              ["event_id", event.event_id],
              ["response_id", event.response_id],
              ["previous_response_id", event.previous_response_id],
              ["subagent_id", declared.subagent_id],
              ["parent_subagent_id", declared.parent_subagent_id],
              ["turn_id", declared.turn_id],
            ] as const
          ).map(([label, value]) => ({ label, value, mono: true })),
        )}
      />
      <EventPropertySection
        title={labels.sectionDevice}
        rows={present([
          { label: labels.hostName, value: device.host_name, mono: true },
          { label: labels.platform, value: device.platform },
          { label: labels.osVersion, value: device.os_version },
        ])}
      />
    </>
  );
}
