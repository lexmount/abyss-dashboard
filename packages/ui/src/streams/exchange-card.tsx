import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../utils";
import type { SessionStreamsLabels } from "./labels";
import {
  occurrenceCount,
  occurrencesBetween,
  type EntryMatches,
  type EventMatches,
  type StreamOccurrence,
} from "./search";
import { Highlighted } from "./stream-search-box";
import type {
  ConversationPreview,
  ConversationPreviewEntry,
  SegmentExchange,
  TextRange,
  TokenCounts,
} from "./types";

/** Characters and lines before an entry shows an expandable text preview. */
const collapsedMaxCharacters = 600;
const collapsedMaxLines = 8;
/**
 * UTF-16 code units of each entry's text a segment page asks for: all that a
 * collapsed entry draws from, so a text cut to it looks collapsed exactly as
 * the whole text does.
 */
export const previewCharacters = collapsedMaxCharacters * 4;

/** How the cards get an event's whole conversation, and show what they give. */
export interface ExchangeCardContext {
  /**
   * Opens an event, such as in an inspector. Without it the cards are read
   * only: neither a card nor an entry can be opened.
   */
  onOpenEvent?: (eventPk: string) => void;
  /**
   * Loads an event's whole conversation, for the entries and texts a preview
   * leaves out. Without it what the preview leaves out stays out.
   */
  loadConversation?: (eventPk: string) => Promise<ConversationPreview>;
  formatTime: (value: string) => string;
  formatDateTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionStreamsLabels;
}

export interface ExchangeCardProps extends ExchangeCardContext {
  side: "request" | "response";
  exchange: SegmentExchange;
  /** The card's event is open in the inspector, or anchored. */
  selected: boolean;
  /** The session's search, or empty. */
  query: string;
  /** Where the search found the query in the card's event, if anywhere. */
  matches: EventMatches | undefined;
  /** The occurrence being viewed, when it is in this card's event. */
  activeMatch: StreamOccurrence | null;
}

/**
 * One side of an exchange: its header, then the entries its preview gives,
 * with the ones left out between them. The card loads the event's whole
 * conversation once the reader asks for an entry left out or a text cut
 * short, or once the search's occurrence being viewed is in an entry left
 * out or past the start of a text the preview gives. Clicking the header or
 * an entry opens the event, when the host can. A request marks where its new
 * part begins. While the session is searched, the entries mark the query.
 */
export const ExchangeCard = React.memo(function ExchangeCard({
  side,
  exchange,
  selected,
  query,
  matches,
  activeMatch,
  onOpenEvent,
  loadConversation,
  formatTime,
  formatDateTime,
  formatNumber,
  labels,
}: ExchangeCardProps) {
  const request = side === "request";
  const preview = request ? exchange.request : exchange.response;
  const eventPk =
    (request ? exchange.request_pk : exchange.response_pk) ?? null;
  const at = (request ? exchange.requested_at : exchange.responded_at) ?? null;
  const [wholeAsked, setWholeAsked] = React.useState(false);
  // The occurrence being viewed is beyond the preview, so the whole is read.
  const beyond =
    activeMatch !== null && preview ? !inPreview(activeMatch, preview) : false;
  const wholeState = useWholeConversation(
    eventPk,
    wholeAsked || beyond,
    loadConversation,
  );
  const shown = wholeState.data ?? preview;
  const loadWhole = React.useCallback(() => setWholeAsked(true), []);
  const whole = React.useMemo(
    (): WholeText | null =>
      loadConversation
        ? {
            loading: wholeState.loading,
            error: wholeState.error,
            load: loadWhole,
          }
        : null,
    [loadConversation, wholeState.loading, wholeState.error, loadWhole],
  );
  const open = React.useMemo(
    () => (eventPk !== null && onOpenEvent ? () => onOpenEvent(eventPk) : null),
    [eventPk, onOpenEvent],
  );

  return (
    <article
      data-event-id={eventPk ?? undefined}
      data-side={side}
      data-selected={selected || undefined}
      className={cn(
        "bg-card overflow-clip rounded-xl border shadow-xs",
        selected && "ring-ring/60 ring-2",
      )}
    >
      <CardHeader
        side={side}
        exchange={exchange}
        at={at}
        selected={selected}
        present={eventPk !== null}
        readOnly={!onOpenEvent}
        onOpen={open}
        formatTime={formatTime}
        formatDateTime={formatDateTime}
        formatNumber={formatNumber}
        labels={labels}
      />
      {eventPk === null || !shown ? (
        <Note>{request ? labels.requestMissing : labels.responseMissing}</Note>
      ) : (
        <>
          <Incomplete completeness={shown.completeness} labels={labels} />
          {shown.entries_total === 0 ? (
            <Note>{labels.noEntries}</Note>
          ) : (
            <EntryList
              preview={shown}
              newFrom={request ? exchange.new_from : null}
              selected={selected}
              whole={whole}
              query={query}
              matches={matches}
              activeMatch={activeMatch}
              onSelect={open}
              formatNumber={formatNumber}
              labels={labels}
            />
          )}
        </>
      )}
    </article>
  );
});

/**
 * Whether an occurrence is in what a preview gives: in one of its entries
 * and, in a text cut short, within the start the preview has. The backend
 * cuts a text short of a surrogate pair it would split, and no occurrence
 * ends inside a pair, so an occurrence is past the cut exactly when it ends
 * after the start's length.
 */
function inPreview(
  occurrence: StreamOccurrence,
  preview: ConversationPreview,
): boolean {
  for (const chunk of preview.chunks) {
    const entry = chunk.entries[occurrence.entryIndex - chunk.from];
    if (occurrence.entryIndex < chunk.from || !entry) {
      continue;
    }
    return (
      occurrence.field !== "text" ||
      entry.text_length === undefined ||
      occurrence.range[1] <= (entry.text ?? "").length
    );
  }
  return false;
}

/** An event's whole conversation, once a card has asked for it. */
interface WholeConversation {
  data: ConversationPreview | undefined;
  loading: boolean;
  /** Why it could not be loaded, or null. */
  error: unknown;
}

/**
 * Loads an event's whole conversation the first time it is wanted, and keeps
 * it while the card is shown; a load once started finishes even when it is
 * no longer wanted.
 */
function useWholeConversation(
  eventPk: string | null,
  wanted: boolean,
  load: ((eventPk: string) => Promise<ConversationPreview>) | undefined,
): WholeConversation {
  const [state, setState] = React.useState<WholeConversation>({
    data: undefined,
    loading: false,
    error: null,
  });
  const started = React.useRef<string | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  React.useEffect(() => {
    if (!wanted || eventPk === null || !load || started.current === eventPk) {
      return;
    }
    started.current = eventPk;
    setState({ data: undefined, loading: true, error: null });
    load(eventPk).then(
      (data) => {
        if (mounted.current) {
          setState({ data, loading: false, error: null });
        }
      },
      (error: unknown) => {
        if (mounted.current) {
          setState({ data: undefined, loading: false, error: error ?? null });
        }
      },
    );
  }, [wanted, eventPk, load]);
  return state;
}

/** How a card gets the entries and texts its preview leaves out. */
interface WholeText {
  /** The whole conversation is being loaded. */
  loading: boolean;
  /** Why the whole conversation could not be loaded, or null. */
  error: unknown;
  load: () => void;
}

/**
 * The side, model, tokens, and time of a card's event; it stays at the top
 * of the viewport, below the session's search, while the card scrolls by.
 */
function CardHeader({
  side,
  exchange,
  at,
  selected,
  present,
  readOnly,
  onOpen,
  formatTime,
  formatDateTime,
  formatNumber,
  labels,
}: {
  side: "request" | "response";
  exchange: SegmentExchange;
  at: string | null;
  selected: boolean;
  /** The card's event was observed. */
  present: boolean;
  /** The host does not open events, so the header is not a control. */
  readOnly: boolean;
  /** Opens the event, or null when it cannot be opened. */
  onOpen: (() => void) | null;
  formatTime: (value: string) => string;
  formatDateTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: SessionStreamsLabels;
}) {
  const request = side === "request";
  const tokens =
    (request ? exchange.request_tokens : exchange.response_tokens) ?? null;
  const content = (
    <>
      <span className="bg-background shrink-0 rounded border px-2 py-0.5 font-semibold">
        {request ? labels.request : labels.response}
      </span>
      <span className="min-w-0 font-mono font-medium [overflow-wrap:anywhere]">
        {exchange.model || labels.unknownModel}
      </span>
      {present ? (
        <span className="shrink-0 font-semibold tabular-nums">
          {tokens
            ? `${formatNumber(tokens.total)} ${labels.tokens}`
            : labels.tokensUnavailable}
        </span>
      ) : null}
      <span
        className="text-muted-foreground ml-auto shrink-0 tabular-nums"
        title={at ? formatDateTime(at) : undefined}
      >
        {at ? formatTime(at) : "—"}
      </span>
      {tokens ? (
        <TokenBreakdown
          tokens={tokens}
          request={request}
          labels={labels}
          formatNumber={formatNumber}
        />
      ) : null}
    </>
  );
  return (
    <div className="bg-card sticky top-11 z-10 border-b">
      {readOnly ? (
        <div
          data-card-header=""
          className="bg-muted/40 flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left text-xs"
        >
          {content}
        </div>
      ) : (
        <button
          type="button"
          data-card-header=""
          aria-pressed={selected}
          disabled={onOpen === null}
          onClick={onOpen ?? undefined}
          className="bg-muted/40 hover:bg-muted/70 focus-visible:ring-ring disabled:hover:bg-muted/40 flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          {content}
        </button>
      )}
    </div>
  );
}

/**
 * Input counts cached and uncached input together; cache reads and writes,
 * and reasoning within the output, show when there are any.
 */
function TokenBreakdown({
  tokens,
  request,
  labels,
  formatNumber,
}: {
  tokens: TokenCounts;
  request: boolean;
  labels: SessionStreamsLabels;
  formatNumber: (value: number) => string;
}) {
  const input = tokens.input + tokens.cache_read + tokens.cache_write;
  const parts: [label: string, value: number, shown: boolean][] = [
    [labels.inputTokens, input, input > 0 || request],
    [labels.outputTokens, tokens.output, tokens.output > 0 || !request],
    [labels.cacheReadTokens, tokens.cache_read, tokens.cache_read > 0],
    [labels.cacheWriteTokens, tokens.cache_write, tokens.cache_write > 0],
    [labels.reasoningTokens, tokens.reasoning, tokens.reasoning > 0],
  ];
  return (
    <span className="text-muted-foreground flex w-full flex-wrap gap-x-3 gap-y-1 tabular-nums">
      {parts
        .filter(([, , shown]) => shown)
        .map(([label, value]) => (
          <span key={label}>
            {label} {formatNumber(value)}
          </span>
        ))}
    </span>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground px-4 py-3 text-xs">{children}</p>;
}

/** Notes a conversation the collector could not decode completely. */
function Incomplete({
  completeness,
  labels,
}: {
  completeness: string | null;
  labels: SessionStreamsLabels;
}) {
  return completeness !== null && completeness !== "complete" ? (
    <Note>{labels.incomplete(completeness)}</Note>
  ) : null;
}

/**
 * Entries of a card along a rule: each run the preview gives, the entries
 * left out between and after the runs, and a mark where a request's new
 * part begins.
 */
function EntryList({
  preview,
  newFrom,
  selected,
  whole,
  query,
  matches,
  activeMatch,
  onSelect,
  formatNumber,
  labels,
}: {
  preview: ConversationPreview;
  /** Index where the request's new part begins, or null. */
  newFrom: number | null;
  selected: boolean;
  /** How to load what the preview leaves out, or null when it cannot be. */
  whole: WholeText | null;
  query: string;
  matches: EventMatches | undefined;
  activeMatch: StreamOccurrence | null;
  /** Opens the entries' event, or null when it cannot be opened. */
  onSelect: (() => void) | null;
  formatNumber: (value: number) => string;
  labels: SessionStreamsLabels;
}) {
  const items: React.ReactNode[] = [];
  let next = 0;
  const gap = (from: number, to: number) => {
    if (to > from) {
      items.push(
        <LeftOut
          key={`gap:${from}`}
          count={to - from}
          matches={query ? occurrencesBetween(matches, from, to) : 0}
          whole={whole}
          formatNumber={formatNumber}
          labels={labels}
        />,
      );
    }
  };
  for (const chunk of preview.chunks) {
    gap(next, chunk.from);
    chunk.entries.forEach((entry, offset) => {
      const index = chunk.from + offset;
      if (newFrom !== null && newFrom > 0 && index === newFrom) {
        items.push(<NewPartMark key="new" label={labels.newPart} />);
      }
      items.push(
        <EntryBlock
          key={index}
          index={index}
          entry={entry}
          whole={entry.text_length === undefined ? null : whole}
          query={query}
          matches={matches?.get(index)}
          active={activeMatch?.entryIndex === index ? activeMatch : null}
          selected={selected}
          onSelect={onSelect}
          formatNumber={formatNumber}
          labels={labels}
        />,
      );
    });
    next = chunk.from + chunk.entries.length;
  }
  gap(next, preview.entries_total);
  return (
    <div className="px-2 py-2 sm:px-3">
      <div className="border-border ml-1 space-y-1 border-l-2 py-1 pl-2 sm:pl-3">
        {items}
      </div>
    </div>
  );
}

/** Where a request's new part begins, after the context it carries. */
function NewPartMark({ label }: { label: string }) {
  return (
    <div className="text-ring flex items-center gap-2 py-1 text-[11px] font-medium">
      <span className="bg-ring/30 h-px flex-1" />
      {label}
      <span className="bg-ring/30 h-px flex-1" />
    </div>
  );
}

/**
 * Entries the preview leaves out, with how many of the search's occurrences
 * they hold, and a control that loads them when the host can.
 */
function LeftOut({
  count,
  matches,
  whole,
  formatNumber,
  labels,
}: {
  count: number;
  /** Occurrences of the search in the entries left out. */
  matches: number;
  whole: WholeText | null;
  formatNumber: (value: number) => string;
  labels: SessionStreamsLabels;
}) {
  const text =
    matches > 0
      ? labels.omittedMatches(formatNumber(count), formatNumber(matches))
      : labels.omitted(formatNumber(count));
  const frame = cn(
    "text-muted-foreground w-full rounded-lg border border-dashed px-2.5 py-1.5 text-left text-xs",
    matches > 0 && "border-ring/50",
  );
  return (
    <div className="py-1">
      {whole === null ? (
        <p className={frame}>{text}</p>
      ) : whole.loading ? (
        <p className="text-muted-foreground text-xs">
          {labels.loadingConversation}
        </p>
      ) : whole.error !== null ? (
        <LoadError error={whole.error} className="" labels={labels} />
      ) : (
        <button
          type="button"
          onClick={whole.load}
          className={cn(frame, "hover:text-foreground hover:bg-muted/60")}
        >
          {text}
        </button>
      )}
    </div>
  );
}

/** Says that an event could not be loaded, and why. */
function LoadError({
  error,
  className = "px-4 py-3",
  labels,
}: {
  error: unknown;
  className?: string;
  labels: SessionStreamsLabels;
}) {
  return (
    <p className={cn("text-destructive text-xs", className)}>
      {labels.loadError(error)}
    </p>
  );
}

/** Text long enough that it shows its first lines until expanded. */
function isLong(text: string): boolean {
  if (text.length > collapsedMaxCharacters) {
    return true;
  }
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10 && ++lines > collapsedMaxLines) {
      return true;
    }
  }
  return false;
}

/**
 * The start of a long text that its first lines are drawn from. Enough of it
 * to fill them at any width; the rest is left out so a long body is not laid
 * out while collapsed.
 */
function collapsedStart(text: string): string {
  let end = Math.min(text.length, previewCharacters);
  let lines = 1;
  for (let index = 0; index < end; index += 1) {
    if (text.charCodeAt(index) === 10 && ++lines > collapsedMaxLines) {
      end = index;
      break;
    }
  }
  return text.slice(0, end);
}

/**
 * One conversation entry. Every role shows short text in full and the first
 * lines of long text until expanded. An entry with a search hit opens until
 * the reader closes it. An entry whose text the preview cut short shows that
 * start when open, with
 * the rest loading or there to load; the reader expanding it loads the rest.
 * Clicking the entry opens its event, when the host can.
 */
const EntryBlock = React.memo(function EntryBlock({
  index,
  entry,
  whole,
  query,
  matches,
  active,
  selected,
  onSelect,
  formatNumber,
  labels,
}: {
  /** Position of the entry in its event's conversation. */
  index: number;
  entry: ConversationPreviewEntry;
  /** How to get the whole text, when `entry.text` is only its start. */
  whole: WholeText | null;
  /** The session's search, or empty. */
  query: string;
  /** Where the search found the query in this entry, if anywhere. */
  matches: EntryMatches | undefined;
  /** The occurrence being viewed, when it is in this entry. */
  active: Pick<StreamOccurrence, "field" | "occurrence"> | null;
  /** The entry's event is open in the inspector. */
  selected: boolean;
  /** Opens the entry's event, or null when it cannot be opened. */
  onSelect: (() => void) | null;
  formatNumber: (value: number) => string;
  labels: SessionStreamsLabels;
}) {
  const hit = query.length > 0 && occurrenceCount(matches) > 0;
  const [expanded, toggleExpanded] = useHitToggle(false, hit ? query : null);
  const text = entry.text ?? "";
  const prose = entry.role === "user" || entry.role === "assistant";
  const long = React.useMemo(
    () => isLong(text) || (entry.text_length ?? text.length) > text.length,
    [text, entry.text_length],
  );
  const collapsed = long && !expanded;
  const visibleText = collapsed ? collapsedStart(text) : text;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const activeField = (field: StreamOccurrence["field"]) =>
    active?.field === field ? active.occurrence : undefined;
  const ring = active ? "ring-ring ring-2" : null;
  // The entry opens its event; the controls inside it act on their own.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  const toggle = (event: React.SyntheticEvent) => {
    stop(event);
    if (!expanded) {
      whole?.load();
    }
    toggleExpanded();
  };
  const located = {
    "data-role": entry.role,
    "data-entry-index": index,
  } as const;
  const selectable =
    onSelect === null
      ? located
      : ({
          ...located,
          role: "button",
          tabIndex: 0,
          "aria-pressed": selected,
          onClick: onSelect,
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.target === event.currentTarget && event.key === "Enter") {
              onSelect();
            }
          },
        } as const);
  // Only an entry that opens its event looks like it does.
  const clickable = onSelect !== null;
  const label = entryLabel(entry.role, labels);
  // Below the open start of a cut text: the rest loading, or there to load.
  const rest =
    expanded && entry.text_length !== undefined && whole !== null ? (
      <RestOfText
        length={entry.text_length}
        whole={whole}
        formatNumber={formatNumber}
        labels={labels}
      />
    ) : null;
  const more = long ? (
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

  if (!prose) {
    const tool = entry.role === "tool_call" || entry.role === "tool_result";
    return (
      <div className="py-1">
        <div
          {...selectable}
          className={cn(
            "rounded-lg border transition-colors outline-none",
            clickable && "cursor-pointer",
            collapsed
              ? cn("bg-muted/30", clickable && "hover:bg-muted/60")
              : "bg-card",
            ring,
          )}
        >
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 text-xs">
            <span className="text-muted-foreground shrink-0">{label}</span>
            {entry.name ? (
              <span className="shrink-0 font-medium">
                <Highlighted
                  text={entry.name}
                  ranges={matches?.name}
                  active={activeField("name")}
                />
              </span>
            ) : null}
            <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
              {labels.characters(
                formatNumber(entry.text_length ?? text.length),
              )}
            </span>
          </div>
          <div className="cursor-auto space-y-2 border-t p-2.5" onClick={stop}>
            {tool ? (
              <ContentBlock
                label={
                  entry.role === "tool_call" ? labels.input : labels.output
                }
                text={visibleText}
                collapsed={collapsed}
                ranges={matches?.text}
                active={activeField("text")}
              />
            ) : (
              <SearchScrollBox
                className={cn(
                  "font-mono text-xs break-words whitespace-pre-wrap",
                  collapsed ? "line-clamp-6" : "max-h-96 overflow-auto",
                )}
                text={visibleText}
                collapsed={collapsed}
                ranges={matches?.text}
                active={activeField("text")}
              />
            )}
            {rest}
            {more}
          </div>
        </div>
      </div>
    );
  }

  const body = text ? (
    <div
      className={cn(
        "text-sm leading-relaxed break-words whitespace-pre-wrap",
        collapsed && "line-clamp-6",
      )}
    >
      <Highlighted
        text={visibleText}
        ranges={matches?.text}
        active={activeField("text")}
      />
    </div>
  ) : (
    <div className="text-muted-foreground text-xs italic">{labels.noText}</div>
  );

  if (entry.role === "user") {
    return (
      <div className="py-1">
        <div
          {...selectable}
          className={cn(
            "border-ring/20 bg-ring/[0.06] rounded-lg border px-3.5 py-2.5 outline-none",
            clickable && "cursor-pointer",
            ring,
          )}
        >
          <div className="text-ring text-xs font-medium">{label}</div>
          <div className="mt-1.5">{body}</div>
          {rest}
          {more}
        </div>
      </div>
    );
  }

  // Replies read as plain prose.
  return (
    <div className="py-1">
      <div
        {...selectable}
        className={cn(
          "rounded-lg px-1 py-1 outline-none",
          clickable && "hover:bg-muted/40 cursor-pointer",
          ring,
        )}
      >
        <div className="text-muted-foreground mb-1.5 text-xs font-medium">
          {label}
        </div>
        {body}
        {rest}
        {more}
      </div>
    </div>
  );
});

/**
 * What follows the start of a text the preview cut short: the whole
 * conversation loading, why it could not load, or a control that loads it.
 */
function RestOfText({
  length,
  whole,
  formatNumber,
  labels,
}: {
  length: number;
  whole: WholeText;
  formatNumber: (value: number) => string;
  labels: SessionStreamsLabels;
}) {
  if (whole.loading) {
    return (
      <p className="text-muted-foreground mt-1 text-xs">
        {labels.loadingConversation}
      </p>
    );
  }
  if (whole.error !== null) {
    return <LoadError error={whole.error} className="mt-1" labels={labels} />;
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        whole.load();
      }}
      className="text-muted-foreground hover:text-foreground mt-1 block text-xs"
    >
      {labels.showRest(formatNumber(length))}
    </button>
  );
}

/** A tool call's input or a tool result's output, under its label. */
function ContentBlock({
  label,
  text,
  collapsed,
  ranges,
  active,
}: {
  label: string;
  text: string;
  collapsed: boolean;
  ranges: readonly TextRange[] | undefined;
  /** Index of the occurrence being viewed within this text, if any. */
  active?: number;
}) {
  return (
    <div className="bg-muted/40 overflow-hidden rounded-md border">
      <div className="text-muted-foreground border-b px-3 py-1 text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
      <div className="p-3">
        <SearchScrollBox
          className={cn(
            "font-mono text-xs break-all whitespace-pre-wrap",
            collapsed ? "line-clamp-6" : "max-h-96 overflow-auto",
          )}
          text={text}
          collapsed={collapsed}
          ranges={ranges}
          active={active}
        />
      </div>
    </div>
  );
}

/**
 * A scrolling text box that, once the search has found hits in it, opens on
 * the hit being viewed or else on its first hit, so hits deep in long text
 * are not out of sight; also when the text grows from its start to the whole.
 */
function SearchScrollBox({
  className,
  text,
  collapsed,
  ranges,
  active,
}: {
  className: string;
  text: string;
  collapsed: boolean;
  /** The search's hits in the text. */
  ranges: readonly TextRange[] | undefined;
  active?: number;
}) {
  const ref = React.useRef<HTMLPreElement>(null);
  React.useLayoutEffect(() => {
    const box = ref.current;
    if (!box) {
      return;
    }
    if (collapsed) {
      box.scrollTop = 0;
      return;
    }
    if (!ranges?.length) {
      return;
    }
    const target =
      box.querySelector<HTMLElement>("[data-active-match]") ??
      box.querySelector<HTMLElement>("mark");
    if (target) {
      const boxRect = box.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      box.scrollTop +=
        rect.top - boxRect.top - (box.clientHeight - rect.height) / 2;
    }
  }, [text, ranges, active, collapsed]);
  return (
    <pre ref={ref} className={className}>
      <Highlighted text={text} ranges={ranges} active={active} />
    </pre>
  );
}

/**
 * A toggle the reader controls. While `hitQuery` names the search an entry
 * has a hit for, the toggle is on unless the reader turned it off during that
 * search; the reader's own choice comes back once the search moves on.
 */
function useHitToggle(
  initial: boolean,
  hitQuery: string | null,
): [boolean, () => void] {
  const [chosen, setChosen] = React.useState(initial);
  const [offFor, setOffFor] = React.useState<string | null>(null);
  if (hitQuery !== null) {
    const on = offFor !== hitQuery;
    return [on, () => setOffFor(on ? hitQuery : null)];
  }
  return [chosen, () => setChosen((current) => !current)];
}

/** An entry's role in words; a role the view does not know shows as sent. */
function entryLabel(role: string, labels: SessionStreamsLabels): string {
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
      return labels.roleToolCall;
    case "tool_result":
      return labels.roleToolResult;
    case "unknown":
      return labels.roleUnknown;
    default:
      return role;
  }
}
