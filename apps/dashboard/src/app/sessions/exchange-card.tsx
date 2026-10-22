import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { apiErrorKind } from "@/api/http";
import {
  fetchEventConversation,
  type ConversationEntry,
  type ConversationPreview,
  type SegmentExchange,
  type TextRange,
  type TokenCounts,
} from "@/api/usage";
import { useI18n } from "@/hooks/use-i18n";
import {
  collapseWhitespace,
  occurrenceCount,
  occurrencesBetween,
  type EntryMatches,
  type EventMatches,
  type StreamOccurrence,
} from "@/lib/stream-search";
import { cn } from "@/lib/utils";
import { Highlighted } from "./stream-search-box";

/**
 * How long a conversation a card loaded in full stays cached once nothing
 * shows it. Request bodies run to hundreds of kilobytes, so a session read
 * end to end must not keep all of them in memory.
 */
const conversationCacheMs = 60_000;

/** Characters and lines of user input or a reply shown before it is expanded. */
const collapsedMaxCharacters = 600;
const collapsedMaxLines = 8;
/**
 * UTF-16 code units of each entry's text a segment page asks for: all that a
 * collapsed entry draws from, so a text cut to it looks collapsed exactly as
 * the whole text does.
 */
export const previewCharacters = collapsedMaxCharacters * 4;

type Translate = ReturnType<typeof useI18n>["t"];

/**
 * One side of an exchange: its header, then the entries its preview gives,
 * with the ones left out between them. The card loads the event's whole
 * conversation once the reader asks for an entry left out or a text cut
 * short, or once the search's occurrence being viewed is in an entry left
 * out or past the start of a text the preview gives. Clicking the header or
 * an entry opens the event in the inspector. A request marks where its new
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
}: {
  side: "request" | "response";
  exchange: SegmentExchange;
  /** The card's event is open in the inspector. */
  selected: boolean;
  /** The session's search, or empty. */
  query: string;
  /** Where the search found the query in the card's event, if anywhere. */
  matches: EventMatches | undefined;
  /** The occurrence being viewed, when it is in this card's event. */
  activeMatch: StreamOccurrence | null;
  onOpenEvent: (eventPk: string) => void;
}) {
  const { t } = useI18n();
  const request = side === "request";
  const preview = request ? exchange.request : exchange.response;
  const eventPk = (request ? exchange.request_pk : exchange.response_pk) ?? null;
  const at = (request ? exchange.requested_at : exchange.responded_at) ?? null;
  const [wholeAsked, setWholeAsked] = React.useState(false);
  // The occurrence being viewed is beyond the preview, so the whole is read.
  const beyond =
    activeMatch !== null && preview ? !inPreview(activeMatch, preview) : false;
  const wholeQuery = useQuery({
    queryKey: ["event-conversation", eventPk],
    queryFn: () => fetchEventConversation(eventPk ?? ""),
    enabled: eventPk !== null && (wholeAsked || beyond),
    // Persisted events never change.
    staleTime: Infinity,
    gcTime: conversationCacheMs,
  });
  const shown = wholeQuery.data ?? preview;
  const loadWhole = React.useCallback(() => setWholeAsked(true), []);
  const whole = React.useMemo(
    (): WholeText => ({
      loading: wholeQuery.isFetching,
      error: wholeQuery.isError ? wholeQuery.error : null,
      load: loadWhole,
    }),
    [wholeQuery.isFetching, wholeQuery.isError, wholeQuery.error, loadWhole],
  );
  const open = React.useCallback(() => {
    if (eventPk !== null) {
      onOpenEvent(eventPk);
    }
  }, [eventPk, onOpenEvent]);

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
        onOpen={eventPk === null ? null : open}
      />
      {eventPk === null || !shown ? (
        <Note>
          {request
            ? t("sessions.streams.requestMissing")
            : t("sessions.streams.responseMissing")}
        </Note>
      ) : (
        <>
          <Incomplete completeness={shown.completeness} />
          {shown.entries_total === 0 ? (
            <Note>{t("sessions.streams.noEntries")}</Note>
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
  onOpen,
}: {
  side: "request" | "response";
  exchange: SegmentExchange;
  at: string | null;
  selected: boolean;
  /** Opens the event, or null when the event is missing. */
  onOpen: (() => void) | null;
}) {
  const { t, formatDateTime, formatNumber } = useI18n();
  const formatTime = useFormatTime();
  const request = side === "request";
  const tokens = (request ? exchange.request_tokens : exchange.response_tokens) ?? null;
  return (
    <div className="bg-card sticky top-11 z-10 border-b">
      <button
        type="button"
        aria-pressed={selected}
        disabled={onOpen === null}
        onClick={onOpen ?? undefined}
        className="bg-muted/40 hover:bg-muted/70 focus-visible:ring-ring disabled:hover:bg-muted/40 flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <span className="bg-background shrink-0 rounded border px-2 py-0.5 font-semibold">
          {request ? t("common.request") : t("common.response")}
        </span>
        <span className="min-w-0 font-mono font-medium [overflow-wrap:anywhere]">
          {exchange.model || t("sessions.trajectory.unknownModel")}
        </span>
        {onOpen !== null ? (
          <span className="shrink-0 font-semibold tabular-nums">
            {tokens
              ? `${formatNumber(tokens.total)} ${t("common.tokens")}`
              : t("sessions.trajectory.tokensUnavailable")}
          </span>
        ) : null}
        <span
          className="text-muted-foreground ml-auto shrink-0 tabular-nums"
          title={at ? formatDateTime(at) : undefined}
        >
          {at ? formatTime(at) : "—"}
        </span>
        {tokens ? <TokenBreakdown tokens={tokens} request={request} /> : null}
      </button>
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
}: {
  tokens: TokenCounts;
  request: boolean;
}) {
  const { t, formatNumber } = useI18n();
  const input = tokens.input + tokens.cache_read + tokens.cache_write;
  const parts: [label: string, value: number, shown: boolean][] = [
    [t("sessions.trajectory.inputTokens"), input, input > 0 || request],
    [
      t("sessions.trajectory.outputTokens"),
      tokens.output,
      tokens.output > 0 || !request,
    ],
    [
      t("sessions.trajectory.cacheReadTokens"),
      tokens.cache_read,
      tokens.cache_read > 0,
    ],
    [
      t("sessions.trajectory.cacheWriteTokens"),
      tokens.cache_write,
      tokens.cache_write > 0,
    ],
    [t("sessions.trajectory.reasoningTokens"), tokens.reasoning, tokens.reasoning > 0],
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
function Incomplete({ completeness }: { completeness: string | null }) {
  const { t } = useI18n();
  return completeness !== null && completeness !== "complete" ? (
    <Note>{t("sessions.event.incomplete", { completeness })}</Note>
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
}: {
  preview: ConversationPreview;
  /** Index where the request's new part begins, or null. */
  newFrom: number | null;
  selected: boolean;
  whole: WholeText;
  query: string;
  matches: EventMatches | undefined;
  activeMatch: StreamOccurrence | null;
  onSelect: () => void;
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
        />,
      );
    }
  };
  for (const chunk of preview.chunks) {
    gap(next, chunk.from);
    chunk.entries.forEach((entry, offset) => {
      const index = chunk.from + offset;
      if (newFrom !== null && newFrom > 0 && index === newFrom) {
        items.push(<NewPartMark key="new" />);
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
function NewPartMark() {
  const { t } = useI18n();
  return (
    <div className="text-ring flex items-center gap-2 py-1 text-[11px] font-medium">
      <span className="bg-ring/30 h-px flex-1" />
      {t("sessions.streams.newPart")}
      <span className="bg-ring/30 h-px flex-1" />
    </div>
  );
}

/**
 * Entries the preview leaves out, with how many of the search's occurrences
 * they hold, and a control that loads them.
 */
function LeftOut({
  count,
  matches,
  whole,
}: {
  count: number;
  /** Occurrences of the search in the entries left out. */
  matches: number;
  whole: WholeText;
}) {
  const { t, formatNumber } = useI18n();
  return (
    <div className="py-1">
      {whole.loading ? (
        <p className="text-muted-foreground text-xs">{t("sessions.event.loading")}</p>
      ) : whole.error !== null ? (
        <LoadError error={whole.error} className="" />
      ) : (
        <button
          type="button"
          onClick={whole.load}
          className={cn(
            "text-muted-foreground hover:text-foreground hover:bg-muted/60 w-full rounded-lg border border-dashed px-2.5 py-1.5 text-left text-xs",
            matches > 0 && "border-ring/50",
          )}
        >
          {matches > 0
            ? t("sessions.streams.omittedMatches", {
                count: formatNumber(count),
                matches: formatNumber(matches),
              })
            : t("sessions.streams.omitted", { count: formatNumber(count) })}
        </button>
      )}
    </div>
  );
}

/** Says that an event could not be loaded, and why. */
function LoadError({
  error,
  className = "px-4 py-3",
}: {
  error: unknown;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <p className={cn("text-destructive text-xs", className)}>
      {t("sessions.event.error", {
        message: t(`error.${apiErrorKind(error)}.title`),
      })}
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
 * A text on one line, for the summary of a collapsed entry, with the
 * search's ranges moved along.
 */
function oneLine(
  text: string,
  ranges: readonly TextRange[] | undefined,
): { text: string; ranges: TextRange[] | undefined } {
  return collapseWhitespace(text.slice(0, 1000), ranges, 300);
}

/**
 * One conversation entry. User input and replies read as text, the long ones
 * showing their first lines until expanded. Every other entry, such as
 * instructions, reasoning, and tool calls and results, starts collapsed to
 * one line. An entry with a search hit opens until the reader closes it. An
 * entry whose text the preview cut short shows that start when open, with
 * the rest loading or there to load; the reader expanding it loads the rest.
 * Clicking the entry opens its event.
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
}: {
  /** Position of the entry in its event's conversation. */
  index: number;
  entry: ConversationEntry;
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
  onSelect: () => void;
}) {
  const { t, formatNumber } = useI18n();
  const hit = query.length > 0 && occurrenceCount(matches) > 0;
  const [expanded, toggleExpanded] = useHitToggle(false, hit ? query : null);
  const text = entry.text ?? "";
  const prose = entry.role === "user" || entry.role === "assistant";
  const long = React.useMemo(() => prose && isLong(text), [prose, text]);
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
  const selectable = {
    role: "button",
    tabIndex: 0,
    "aria-pressed": selected,
    "data-role": entry.role,
    "data-entry-index": index,
    onClick: onSelect,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.target === event.currentTarget && event.key === "Enter") {
        onSelect();
      }
    },
  } as const;
  const label = entryLabel(entry.role, t);
  // Below the open start of a cut text: the rest loading, or there to load.
  const rest =
    expanded && entry.text_length !== undefined && whole !== null ? (
      <RestOfText length={entry.text_length} whole={whole} />
    ) : null;

  if (!prose) {
    const tool = entry.role === "tool_call" || entry.role === "tool_result";
    return (
      <div className="py-1">
        <div
          {...selectable}
          className={cn(
            "cursor-pointer rounded-lg border transition-colors outline-none",
            expanded ? "bg-card" : "bg-muted/30 hover:bg-muted/60",
            ring,
          )}
        >
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 text-xs">
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? t("sessions.trajectory.showLess")
                  : t("sessions.trajectory.showMore")
              }
              onClick={toggle}
              className="text-muted-foreground hover:text-foreground -m-1 rounded p-1"
            >
              <Chevron className="size-3.5 shrink-0" />
            </button>
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
            <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[11px]">
              {tool && !expanded ? <Summary text={text} ranges={matches?.text} /> : ""}
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {t("sessions.event.characters", {
                count: formatNumber(entry.text_length ?? text.length),
              })}
            </span>
          </div>
          {expanded ? (
            <div className="cursor-auto space-y-2 border-t p-2.5" onClick={stop}>
              {tool ? (
                <ContentBlock
                  label={
                    entry.role === "tool_call"
                      ? t("sessions.trajectory.input")
                      : t("sessions.trajectory.output")
                  }
                  text={text}
                  ranges={matches?.text}
                  active={activeField("text")}
                />
              ) : (
                <SearchScrollBox
                  className="max-h-96 overflow-auto font-mono text-xs break-words whitespace-pre-wrap"
                  text={text}
                  ranges={matches?.text}
                  active={activeField("text")}
                />
              )}
              {rest}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const body = text ? (
    <div
      className={cn(
        "text-sm leading-relaxed break-words whitespace-pre-wrap",
        long && !expanded && "line-clamp-6",
      )}
    >
      <Highlighted
        text={long && !expanded ? collapsedStart(text) : text}
        ranges={matches?.text}
        active={activeField("text")}
      />
    </div>
  ) : (
    <div className="text-muted-foreground text-xs italic">
      {t("sessions.event.noText")}
    </div>
  );
  const more = long ? (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={toggle}
      className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-0.5 text-xs"
    >
      <Chevron className="size-3.5" />
      {expanded ? t("sessions.trajectory.showLess") : t("sessions.trajectory.showMore")}
    </button>
  ) : null;

  if (entry.role === "user") {
    return (
      <div className="py-1">
        <div
          {...selectable}
          className={cn(
            "border-ring/20 bg-ring/[0.06] cursor-pointer rounded-lg border px-3.5 py-2.5 outline-none",
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
          "hover:bg-muted/40 cursor-pointer rounded-lg px-1 py-1 outline-none",
          ring,
        )}
      >
        <div className="text-muted-foreground mb-1.5 text-xs font-medium">{label}</div>
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
function RestOfText({ length, whole }: { length: number; whole: WholeText }) {
  const { t, formatNumber } = useI18n();
  if (whole.loading) {
    return (
      <p className="text-muted-foreground mt-1 text-xs">
        {t("sessions.event.loading")}
      </p>
    );
  }
  if (whole.error !== null) {
    return <LoadError error={whole.error} className="mt-1" />;
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
      {t("sessions.event.showMore", { count: formatNumber(length) })}
    </button>
  );
}

/** A collapsed tool call's or result's text on one line, with its hits marked. */
function Summary({
  text,
  ranges,
}: {
  text: string;
  ranges: readonly TextRange[] | undefined;
}) {
  const line = React.useMemo(() => oneLine(text, ranges), [text, ranges]);
  return <Highlighted text={line.text} ranges={line.ranges} />;
}

/** A tool call's input or a tool result's output, under its label. */
function ContentBlock({
  label,
  text,
  ranges,
  active,
}: {
  label: string;
  text: string;
  ranges: readonly TextRange[] | undefined;
  /** Index of the occurrence being viewed within this text, if any. */
  active?: number;
}) {
  return (
    <div className="bg-muted/40 overflow-hidden rounded-md border">
      <div className="text-muted-foreground border-b px-3 py-1 text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
      <SearchScrollBox
        className="max-h-96 overflow-auto p-3 font-mono text-xs break-all whitespace-pre-wrap"
        text={text}
        ranges={ranges}
        active={active}
      />
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
  ranges,
  active,
}: {
  className: string;
  text: string;
  /** The search's hits in the text. */
  ranges: readonly TextRange[] | undefined;
  active?: number;
}) {
  const ref = React.useRef<HTMLPreElement>(null);
  React.useLayoutEffect(() => {
    const box = ref.current;
    if (!box || !ranges?.length) {
      return;
    }
    const target =
      box.querySelector<HTMLElement>("[data-active-match]") ??
      box.querySelector<HTMLElement>("mark");
    if (target) {
      const boxRect = box.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      box.scrollTop += rect.top - boxRect.top - (box.clientHeight - rect.height) / 2;
    }
  }, [text, ranges, active]);
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

/** An entry's role in words; a role this page does not know shows as sent. */
function entryLabel(role: string, t: Translate): string {
  switch (role) {
    case "system":
      return t("sessions.trajectory.system");
    case "developer":
      return t("sessions.trajectory.developer");
    case "user":
      return t("sessions.trajectory.user");
    case "assistant":
      return t("sessions.trajectory.assistant");
    case "reasoning":
      return t("sessions.trajectory.reasoning");
    case "tool_call":
      return t("sessions.detail.toolCall");
    case "tool_result":
      return t("sessions.detail.toolResult");
    case "unknown":
      return t("sessions.event.roleUnknown");
    default:
      return role;
  }
}

/** Formats an instant as its time of day, with seconds. */
function useFormatTime(): (value: string) => string {
  const { locale } = useI18n();
  return React.useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { timeStyle: "medium" });
    return (value: string) => format.format(new Date(value));
  }, [locale]);
}
