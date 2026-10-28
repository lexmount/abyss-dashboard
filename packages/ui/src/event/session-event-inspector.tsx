import { Copy, ImageIcon, X } from "lucide-react";
import * as React from "react";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { cn } from "../utils";
import {
  conversationOf,
  leadingInstructionCount,
  recordedHeaders,
  recordedOmitted,
  recordedPurpose,
  type Conversation,
  type ConversationEntry,
  type RecordedHeader,
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
 * One raw request or response event exactly as recorded. Any additional
 * scalar fields are listed verbatim in the properties tab.
 */
export interface SessionEventDetail {
  id: string;
  event_type: string;
  llm_model: string;
  observed_at: string;
  metadata: unknown;
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
  /** Host-provided derived properties, shown before the recorded scalar fields. */
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
  const headers = React.useMemo(
    () => (event ? recordedHeaders(event.metadata) : []),
    [event],
  );
  const conversation = React.useMemo(
    () => (event ? conversationOf(event.metadata) : null),
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
          {properties}
          <PropertiesPanel event={detail.event} formatNumber={formatNumber} />
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
              {event.llm_model} · {formatDateTime(event.observed_at)}
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
  headers: RecordedHeader[];
  labels: SessionEventInspectorLabels;
}) {
  const [raw, setRaw] = React.useState(false);
  // Header names cannot contain spaces or parentheses, so the copied marker
  // cannot be mistaken for part of a name.
  const text = headers
    .map((header) =>
      "value" in header
        ? `${header.name}: ${header.value}`
        : `${header.name} (base64): ${header.valueBase64}`,
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
                    {header.valueBase64}{" "}
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

/**
 * Lists every scalar field of the event verbatim, then the call's purpose and
 * the content left out when the collector recorded them, so nothing recorded
 * is hidden.
 */
function PropertiesPanel({
  event,
  formatNumber,
}: {
  event: SessionEventDetail;
  formatNumber: (value: number) => string;
}) {
  const purpose = recordedPurpose(event.metadata);
  const omitted = recordedOmitted(event.metadata);
  const rows: [string, unknown][] = [
    ...Object.entries(event).filter(
      ([key, value]) =>
        !nonScalarFields.has(key) &&
        (value === null || typeof value !== "object"),
    ),
    // What the collector said of the call and of its content, kept in the
    // metadata; each only when the event has it.
    ...(purpose === null ? [] : [["purpose", purpose] as [string, unknown]]),
    ...(omitted.length === 0
      ? []
      : [["omitted", omitted.join(", ")] as [string, unknown]]),
  ];
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
const nonScalarFields = new Set(["metadata", "attachments"]);
