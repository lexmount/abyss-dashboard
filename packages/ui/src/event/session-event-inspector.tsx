import { Copy, ImageIcon, X } from "lucide-react";
import * as React from "react";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { cn } from "../utils";
import { toolContentSegments, type ToolContentSegment } from "./event-content";
import type { SessionImageAttachment } from "./session-timeline";

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
  turn_index: number;
  llm_model: string;
  observed_at: string;
  text: string | null;
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
  turn: (index: number) => string;
  close: string;
  resize: string;
  loading: string;
  error: (message: string) => string;
  copy: string;
  noText: string;
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

export interface SessionEventInspectorProps {
  detail: SessionEventDetailState;
  onClose: () => void;
  attachmentUrl: (attachmentId: string) => string;
  formatDateTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionEventInspectorLabels;
}

type InspectorTab =
  "content" | "tools" | "attachments" | "metadata" | "properties";

/** Resizable side panel showing one raw event with every recorded field. */
export function SessionEventInspector({
  detail,
  onClose,
  attachmentUrl,
  formatDateTime,
  formatNumber,
  labels,
}: SessionEventInspectorProps) {
  const [width, setWidth] = React.useState(INSPECTOR_DEFAULT_WIDTH_PX);
  const [tab, setTab] = React.useState<InspectorTab>("content");
  const event = detail.status === "ready" ? detail.event : null;
  const segments = React.useMemo(
    () => (event ? toolContentSegments(event.metadata) : []),
    [event],
  );
  const request = event?.event_type === "request";
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: "content", label: labels.tabContent },
    {
      id: "tools",
      label: event
        ? `${labels.tabTools} (${formatNumber(segments.length)})`
        : labels.tabTools,
    },
    ...(event && event.attachments.length > 0
      ? [
          {
            id: "attachments" as const,
            label: `${labels.tabAttachments} (${formatNumber(event.attachments.length)})`,
          },
        ]
      : []),
    { id: "metadata", label: labels.tabMetadata },
    { id: "properties", label: labels.tabProperties },
  ];

  return (
    <aside
      aria-label={labels.title}
      className="bg-background flex min-w-0 flex-col max-lg:absolute max-lg:inset-0 max-lg:z-10 lg:relative lg:w-(--event-inspector-width) lg:shrink-0 lg:border-l"
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
            {event ? labels.turn(event.turn_index) : labels.title}
          </div>
          {event ? (
            <div className="text-muted-foreground truncate text-xs">
              {event.llm_model} · {formatDateTime(event.observed_at)}
            </div>
          ) : null}
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
        {detail.status === "loading" ? (
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
        ) : tab === "metadata" ? (
          <MetadataPanel metadata={detail.event.metadata} />
        ) : (
          <PropertiesPanel event={detail.event} formatNumber={formatNumber} />
        )}
      </div>
    </aside>
  );
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

function TextPanel({
  text,
  labels,
}: {
  text: string | null;
  labels: SessionEventInspectorLabels;
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
  labels: SessionEventInspectorLabels;
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

/** Lists every scalar field of the event verbatim, so nothing recorded is hidden. */
function PropertiesPanel({
  event,
  formatNumber,
}: {
  event: SessionEventDetail;
  formatNumber: (value: number) => string;
}) {
  const rows = Object.entries(event).filter(
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
const nonScalarFields = new Set(["text", "metadata", "attachments"]);
