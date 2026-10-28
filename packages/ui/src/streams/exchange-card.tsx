import * as React from "react";
import { cn } from "../utils";
import type { SessionStreamsLabels } from "./labels";
import {
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
  TokenCounts,
} from "./types";

/**
 * UTF-16 code units of each entry's text a segment page asks for: what an
 * entry shows when opened, before the rest of a longer text is loaded.
 */
export const previewCharacters = 2400;
/** UTF-16 code units of an entry's text its one-line preview is drawn from. */
const lineCharacters = 400;
/** How much of the text before a hit past the start its line shows. */
const lineLead = 40;

/** How the cards get an event's whole conversation, and show what they give. */
export interface ExchangeCardContext {
  /**
   * Opens an event, such as in an inspector; at one of its entries, by its
   * index in the event's conversation, when the reader chose that entry.
   * Without it the cards are read only: neither a card nor an entry can be
   * opened.
   */
  onOpenEvent?: (eventPk: string, entryIndex?: number) => void;
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
 * out or past the start of a text the preview gives. Clicking the header
 * opens the event, and clicking an entry opens it at that entry, when the
 * host can. A request marks where its new
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
  // The reader asked for what the preview leaves out: once it is in, the
  // page goes to where the request's new part begins, or to the card's end.
  const [revealAsked, setRevealAsked] = React.useState(false);
  const articleRef = React.useRef<HTMLElement>(null);
  const loaded = wholeState.data !== null && wholeState.data !== undefined;
  React.useLayoutEffect(() => {
    const article = articleRef.current;
    if (!revealAsked || !loaded || !article) {
      return;
    }
    setRevealAsked(false);
    revealNewPart(article);
  }, [revealAsked, loaded]);
  const loadWhole = React.useCallback(() => {
    setWholeAsked(true);
    setRevealAsked(true);
  }, []);
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
  const openAt = React.useMemo(
    () =>
      eventPk !== null && onOpenEvent
        ? (entryIndex: number) => onOpenEvent(eventPk, entryIndex)
        : null,
    [eventPk, onOpenEvent],
  );

  return (
    <article
      ref={articleRef}
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
              onSelect={openAt}
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
      {/* A request's input split is in the inspector's properties. */}
      {tokens && !request ? (
        <TokenBreakdown
          tokens={tokens}
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
/** A response's tokens: its output, and any other counts it has. */
function TokenBreakdown({
  tokens,
  labels,
  formatNumber,
}: {
  tokens: TokenCounts;
  labels: SessionStreamsLabels;
  formatNumber: (value: number) => string;
}) {
  const input = tokens.input + tokens.cache_read + tokens.cache_write;
  const parts: [label: string, value: number, shown: boolean][] = [
    [labels.inputTokens, input, input > 0],
    [labels.outputTokens, tokens.output, true],
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
 * Entries of a card, one row each: each run the preview gives, the entries
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
  /** Opens the entries' event at one of them, or null when it cannot be opened. */
  onSelect: ((entryIndex: number) => void) | null;
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
  return <div className="divide-y">{items}</div>;
}

/** Room kept above what a card reveals, below the search and its header. */
const revealGapPx = 8;
/** Height of the session's search, which the card headers stick under. */
const searchBarPx = 44;

/**
 * Scrolls the page to where a card's request begins its new part, just below
 * the card's sticky header; without that mark, to the card's end.
 */
function revealNewPart(article: HTMLElement) {
  const mark = article.querySelector<HTMLElement>("[data-new-part]");
  if (mark) {
    const header =
      article.querySelector<HTMLElement>("[data-card-header]")?.offsetHeight ??
      0;
    window.scrollTo({
      top:
        window.scrollY +
        mark.getBoundingClientRect().top -
        searchBarPx -
        header -
        revealGapPx,
      behavior: "instant",
    });
    return;
  }
  const bottom = article.getBoundingClientRect().bottom;
  window.scrollTo({
    top: window.scrollY + bottom - window.innerHeight + revealGapPx,
    behavior: "instant",
  });
}

/** Where a request's new part begins, after the context it carries. */
function NewPartMark({ label }: { label: string }) {
  return (
    <div
      data-new-part
      className="text-ring flex items-center gap-2 px-4 py-1.5 text-[11px] font-medium"
    >
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
    "text-muted-foreground w-full px-4 py-2 text-left text-xs",
    matches > 0 && "text-ring",
  );
  return (
    <div>
      {whole === null ? (
        <p className={frame}>{text}</p>
      ) : whole.loading ? (
        <p className="text-muted-foreground px-4 py-2 text-xs">
          {labels.loadingConversation}
        </p>
      ) : whole.error !== null ? (
        <LoadError error={whole.error} className="px-4 py-2" labels={labels} />
      ) : (
        <button
          type="button"
          onClick={whole.load}
          className={cn(frame, "hover:text-foreground hover:bg-muted/40")}
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

/**
 * One conversation entry as a row: its role, a tool's name, and the start of
 * its text on one line, with the search's hits there marked. Clicking the row
 * opens its event at this entry, when the host can; the whole text is read
 * there.
 */
const EntryBlock = React.memo(function EntryBlock({
  index,
  entry,
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
  /** Where the search found the query in this entry, if anywhere. */
  matches: EntryMatches | undefined;
  /** The occurrence being viewed, when it is in this entry. */
  active: Pick<StreamOccurrence, "field" | "occurrence"> | null;
  /** The entry's event is open in the inspector. */
  selected: boolean;
  /** Opens the entry's event at an entry, or null when it cannot be opened. */
  onSelect: ((entryIndex: number) => void) | null;
  formatNumber: (value: number) => string;
  labels: SessionStreamsLabels;
}) {
  const text = entry.text ?? "";
  const prose = entry.role === "user" || entry.role === "assistant";
  const activeField = (field: StreamOccurrence["field"]) =>
    active?.field === field ? active.occurrence : undefined;
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
          onClick: () => onSelect(index),
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.target === event.currentTarget && event.key === "Enter") {
              onSelect(index);
            }
          },
        } as const);
  // Only an entry that opens its event looks like it does.
  const clickable = onSelect !== null;
  // The line is the text's start, or, when the hit being viewed lies past
  // it, the stretch around that hit; it folds its breaks into spaces.
  const viewed =
    activeField("text") === undefined
      ? undefined
      : matches?.text?.[activeField("text")!];
  const from =
    viewed !== undefined && viewed[1] > lineCharacters
      ? Math.max(0, viewed[0] - lineLead)
      : 0;
  const line = text.slice(from, from + lineCharacters);
  const lineRanges = React.useMemo(
    () =>
      matches?.text
        ?.filter(([start, end]) => start >= from && end <= from + line.length)
        .map(([start, end]): [number, number] => [start - from, end - from]),
    [matches, from, line.length],
  );
  // Hits before the line are not on it, so the viewed one counts from there.
  const lineActive =
    activeField("text") === undefined
      ? undefined
      : activeField("text")! -
        (matches?.text?.filter(([start]) => start < from).length ?? 0);

  return (
    <div
      {...selectable}
      className={cn(
        "flex min-w-0 items-center gap-2 px-3 py-1.5 text-xs transition-colors outline-none",
        clickable && "hover:bg-muted/40 cursor-pointer",
        active && "ring-ring ring-2 ring-inset",
      )}
    >
      <RoleTag role={entry.role} label={entryLabel(entry.role, labels)} />
      {entry.name ? (
        <span className="shrink-0 font-mono font-medium">
          <Highlighted
            text={entry.name}
            ranges={matches?.name}
            active={activeField("name")}
          />
        </span>
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          !text && "text-muted-foreground italic",
          prose ? "text-[13px]" : "font-mono",
        )}
        title={text ? line : undefined}
      >
        {text ? (
          <>
            {from > 0 ? "…" : null}
            <Highlighted text={line} ranges={lineRanges} active={lineActive} />
          </>
        ) : (
          labels.noText
        )}
      </span>
      <span className="text-muted-foreground shrink-0 tabular-nums">
        {labels.characters(formatNumber(entry.text_length ?? text.length))}
      </span>
    </div>
  );
});

/** Colors of a role's tag: who speaks, and tool traffic apart. */
const roleTagClass: Record<string, string> = {
  user: "bg-chart-3/12 text-chart-3",
  assistant: "bg-chart-1/12 text-chart-1",
  reasoning: "bg-chart-1/6 text-chart-1/75",
  tool_call:
    "bg-chart-5/14 text-[color-mix(in_oklab,var(--chart-5)_70%,var(--foreground))]",
  tool_result:
    "bg-chart-5/8 text-[color-mix(in_oklab,var(--chart-5)_55%,var(--muted-foreground))]",
};

/** A role as a small tag, the same width for every role. */
function RoleTag({ role, label }: { role: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-[5.5rem] shrink-0 items-center justify-center truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
        roleTagClass[role] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
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
