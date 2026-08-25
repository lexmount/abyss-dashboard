import { Clock, ImageIcon, MessageSquareText } from "lucide-react";
import { Badge } from "../components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/card";
import { ScrollArea } from "../components/scroll-area";
import { Separator } from "../components/separator";

const scrollableContentMaxCharacters = 1_200;
const scrollableContentMaxLines = 12;

export interface SessionTimelineViewModel {
  session: SessionTimelineSession;
  turns: SessionTimelineTurn[];
}

export interface SessionTimelineSession {
  session_pk?: string;
  device_context_id?: string;
  agent_name: string;
  agent_version: string | null;
  session_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface SessionTimelineTurn {
  turn_pk?: string;
  turn_index: number;
  started_at: string;
  ended_at: string | null;
  events: SessionTimelineEvent[];
}

export interface SessionTimelineEvent {
  id?: string;
  event_type: string;
  llm_provider: string;
  llm_model: string;
  text: string | null;
  total_tokens: number;
  observed_at: string;
  metadata?: unknown;
  attachments?: SessionImageAttachment[];
}

export interface SessionImageAttachment {
  id: string;
  position: number;
  media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  byte_size: number;
  sha256: string;
  content_available: boolean;
}

export interface SessionTimelineLabels {
  agent: string;
  callId: string;
  deviceContext: string;
  ended: (time: string) => string;
  estimatedTokens: string;
  image: string;
  imageContentHidden: string;
  imageLabel: (index: number) => string;
  noEvents: string;
  noText: string;
  noTurns: string;
  openImage: (label: string) => string;
  request: string;
  response: string;
  sessionPk: string;
  started: (time: string) => string;
  timeline: string;
  tokens: string;
  toolCall: string;
  toolContentHidden: string;
  toolResult: string;
  turn: (index: number) => string;
  turns: (count: string) => string;
  version: string;
}

export interface SessionTimelineProps {
  attachmentUrl: (attachmentId: string) => string;
  formatAgentName: (agentName: string) => string;
  formatDateTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionTimelineLabels;
  timeline: SessionTimelineViewModel;
  showInternalIdentifiers?: boolean;
}

interface ToolContentSegment {
  type: "tool_call" | "tool_result";
  itemId: string | null;
  callId: string | null;
  name: string | null;
  content: string | null;
}

export function SessionTimeline({
  attachmentUrl,
  formatAgentName,
  formatDateTime,
  formatNumber,
  labels,
  timeline,
  showInternalIdentifiers = false,
}: SessionTimelineProps) {
  const presentation = {
    attachmentUrl,
    formatAgentName,
    formatDateTime,
    formatNumber,
    labels,
  };

  return (
    <>
      <SessionOverview
        presentation={presentation}
        session={timeline.session}
        showInternalIdentifiers={showInternalIdentifiers}
      />
      <Card>
        <CardHeader>
          <CardTitle>{labels.timeline}</CardTitle>
          <CardDescription>
            {labels.turns(formatNumber(timeline.turns.length))}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {timeline.turns.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">
              {labels.noTurns}
            </div>
          ) : (
            timeline.turns.map((turn) => (
              <SessionTurn
                key={turn.turn_pk ?? turn.turn_index}
                presentation={presentation}
                turn={turn}
              />
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}

type SessionTimelinePresentation = Pick<
  SessionTimelineProps,
  | "attachmentUrl"
  | "formatAgentName"
  | "formatDateTime"
  | "formatNumber"
  | "labels"
>;

function SessionOverview({
  presentation,
  session,
  showInternalIdentifiers,
}: {
  presentation: SessionTimelinePresentation;
  session: SessionTimelineSession;
  showInternalIdentifiers: boolean;
}) {
  const { formatAgentName, formatDateTime, labels } = presentation;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{session.session_id}</CardTitle>
        <CardDescription>
          {labels.started(formatDateTime(session.started_at))}
          {session.ended_at
            ? labels.ended(formatDateTime(session.ended_at))
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent
        className={
          showInternalIdentifiers
            ? "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            : "grid gap-4 md:grid-cols-2"
        }
      >
        <OverviewField
          label={labels.agent}
          value={formatAgentName(session.agent_name)}
        />
        <OverviewField
          label={labels.version}
          value={session.agent_version ?? "-"}
        />
        {showInternalIdentifiers && session.session_pk ? (
          <OverviewField
            label={labels.sessionPk}
            value={session.session_pk}
            mono
          />
        ) : null}
        {showInternalIdentifiers && session.device_context_id ? (
          <OverviewField
            label={labels.deviceContext}
            value={session.device_context_id}
            mono
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function OverviewField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div className={mono ? "truncate font-mono text-xs" : "truncate text-sm"}>
        {value}
      </div>
    </div>
  );
}

function SessionTurn({
  presentation,
  turn,
}: {
  presentation: SessionTimelinePresentation;
  turn: SessionTimelineTurn;
}) {
  const { formatDateTime, labels } = presentation;

  return (
    <section className="bg-muted/20 rounded-lg border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <MessageSquareText className="text-muted-foreground size-4" />
          <div className="font-medium">{labels.turn(turn.turn_index)}</div>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Clock className="size-3.5" />
          {formatDateTime(turn.started_at)}
        </div>
      </div>

      <Separator className="my-4" />

      <div className="space-y-3">
        {turn.events.length === 0 ? (
          <div className="text-muted-foreground text-sm">{labels.noEvents}</div>
        ) : (
          turn.events.map((event, eventIndex) => (
            <SessionEvent
              key={event.id ?? `${turn.turn_index}-${eventIndex}`}
              event={event}
              presentation={presentation}
            />
          ))
        )}
      </div>
    </section>
  );
}

function SessionEvent({
  event,
  presentation,
}: {
  event: SessionTimelineEvent;
  presentation: SessionTimelinePresentation;
}) {
  const { formatDateTime, formatNumber, labels } = presentation;
  const eventText = eventTextOrPlaceholder(event.text, labels.noText);
  const toolSegments = toolContentSegments(event.metadata);
  const imageAttachments = event.attachments ?? [];
  const tokenUsageEstimated = isEstimatedTokenUsage(event.metadata);
  const textContent = (
    <div className="p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
      {eventText}
    </div>
  );

  return (
    <div className="bg-background rounded-md border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={event.event_type === "request" ? "default" : "secondary"}
          >
            {event.event_type === "request" ? labels.request : labels.response}
          </Badge>
          <span className="text-sm font-medium">{event.llm_model}</span>
          <span className="text-muted-foreground text-xs">
            {event.llm_provider}
          </span>
        </div>
        <div
          className="text-muted-foreground text-xs"
          title={tokenUsageEstimated ? labels.estimatedTokens : undefined}
        >
          {tokenUsageEstimated ? "≈ " : ""}
          {formatNumber(event.total_tokens)} {labels.tokens}
        </div>
      </div>
      <div className="text-muted-foreground mt-2 text-xs">
        {formatDateTime(event.observed_at)}
      </div>
      {toolSegments.length > 0 ? (
        <div className="mt-3 space-y-2">
          {toolSegments.map((segment, index) => (
            <ToolSegmentCard
              key={
                segment.itemId ?? segment.callId ?? `${segment.type}-${index}`
              }
              labels={labels}
              segment={segment}
            />
          ))}
        </div>
      ) : null}
      {imageAttachments.length > 0 ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {imageAttachments.map((attachment) => (
            <ImageAttachmentCard
              key={attachment.id}
              attachment={attachment}
              presentation={presentation}
            />
          ))}
        </div>
      ) : null}
      {shouldScrollContent(eventText) ? (
        <ScrollArea type="always" className="mt-3 h-72 rounded-md bg-muted/40">
          {textContent}
        </ScrollArea>
      ) : (
        <div className="mt-3 rounded-md bg-muted/40">{textContent}</div>
      )}
    </div>
  );
}

function ImageAttachmentCard({
  attachment,
  presentation,
}: {
  attachment: SessionImageAttachment;
  presentation: SessionTimelinePresentation;
}) {
  const { attachmentUrl, formatNumber, labels } = presentation;
  const imageLabel = labels.imageLabel(attachment.position + 1);
  const source = attachmentUrl(attachment.id);

  return (
    <div className="overflow-hidden rounded-md border bg-muted/20">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <ImageIcon className="text-muted-foreground size-4" />
        <Badge variant="outline">{labels.image}</Badge>
        <span className="text-muted-foreground text-xs">
          {attachment.media_type}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatNumber(attachment.byte_size)} B
        </span>
      </div>
      {attachment.content_available ? (
        <a
          className="flex min-h-32 items-center justify-center bg-muted/30 p-3"
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
}

function ToolSegmentCard({
  labels,
  segment,
}: {
  labels: SessionTimelineLabels;
  segment: ToolContentSegment;
}) {
  const label =
    segment.type === "tool_call" ? labels.toolCall : labels.toolResult;
  const content = segment.content ?? labels.toolContentHidden;
  const contentElement = (
    <pre className="p-3 font-mono text-xs break-all whitespace-pre-wrap">
      {content}
    </pre>
  );

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{label}</Badge>
        {segment.name ? (
          <span className="text-sm font-medium">{segment.name}</span>
        ) : null}
        {segment.callId ? (
          <span className="text-muted-foreground font-mono text-xs">
            {labels.callId}: {segment.callId}
          </span>
        ) : null}
      </div>
      {shouldScrollContent(content) ? (
        <ScrollArea type="always" className="mt-2 h-72 rounded bg-muted/50">
          {contentElement}
        </ScrollArea>
      ) : (
        <div className="mt-2 overflow-x-auto rounded bg-muted/50">
          {contentElement}
        </div>
      )}
    </div>
  );
}

function eventTextOrPlaceholder(
  text: string | null,
  placeholder: string,
): string {
  return text?.trim() ? text : placeholder;
}

function isEstimatedTokenUsage(metadata: unknown): boolean {
  return isRecord(metadata) && metadata.token_usage_estimated === true;
}

function shouldScrollContent(text: string): boolean {
  return (
    text.length > scrollableContentMaxCharacters ||
    text.split(/\r\n|\r|\n/).length > scrollableContentMaxLines
  );
}

function toolContentSegments(metadata: unknown): ToolContentSegment[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.content_segments)) {
    return [];
  }

  return metadata.content_segments.flatMap((value): ToolContentSegment[] => {
    if (
      !isRecord(value) ||
      (value.type !== "tool_call" && value.type !== "tool_result")
    ) {
      return [];
    }
    const isToolCall = value.type === "tool_call";
    return [
      {
        type: value.type,
        itemId: stringValue(value.item_id),
        callId: stringValue(value.call_id),
        name: isToolCall ? stringValue(value.name) : null,
        content: stringValue(isToolCall ? value.input : value.output),
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
