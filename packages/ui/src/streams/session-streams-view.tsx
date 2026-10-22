import * as React from "react";
import { Card, CardContent } from "../components/card";
import {
  ExchangeCard,
  previewCharacters,
  type ExchangeCardContext,
} from "./exchange-card";
import type { SessionStreamsLabels } from "./labels";
import { streamLayout } from "./layout";
import type { SessionMatches, StreamOccurrence } from "./search";
import { StreamTimeline } from "./stream-timeline";
import type { SegmentExchange, StreamSegment } from "./types";

/**
 * What a card shows of each request and response before it is expanded: the
 * first few entries, each text as far as a collapsed entry draws from. The
 * host asks for a segment's exchanges with this preview window.
 */
export const exchangePreviewWindow = {
  entries: "0-2",
  textPreview: previewCharacters,
} as const;

/** Leading characters of an exchange id, enough to tell them apart. */
const shortId = (id: string) => id.slice(0, 14);

/**
 * Frames a match being revealed is looked for, while its segment and card
 * load and, past the preview, its event is read in full.
 */
const revealFrames = 600;

/** The exchanges of the segment shown, as the host has them. */
export type SegmentExchangesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      /** Head of the segment the exchanges are in, as the host was given it. */
      segment: string;
      exchanges: readonly SegmentExchange[];
    };

/** The session's search as the cards and the timeline show it. */
export interface SessionSearchView {
  /** The settled search text. */
  query: string;
  /** Where the search found the query, once it has. */
  matches: SessionMatches | null;
  /** Occurrences per segment head, once the search has found them. */
  segmentMatches: ReadonlyMap<string, number> | null;
  /** The occurrence being viewed. */
  active: StreamOccurrence | null;
  /** Each new value asks for the occurrence being viewed to be scrolled to. */
  revealRequest: number;
}

/** A search that has found nothing, for a view without one. */
const noSearch: SessionSearchView = {
  query: "",
  matches: null,
  segmentMatches: null,
  active: null,
  revealRequest: 0,
};

export interface SessionStreamsViewProps extends ExchangeCardContext {
  /** The session's segments, in session order. */
  segments: readonly StreamSegment[];
  /** Head of the segment shown; the first segment when null. */
  segment: string | null;
  /** The exchanges of the segment shown, with `exchangePreviewWindow` previews. */
  exchanges: SegmentExchangesState;
  onSelectSegment: (head: string) => void;
  /** The event open in the inspector, highlighted in the list. */
  selectedEventId?: string | null;
  /** Stable event anchor to highlight and scroll to after its cards load. */
  anchoredEventId?: string | null;
  /** Exchange fallback for an event grouped with another event on the same side. */
  anchoredExchangeId?: string | null;
  /** The session's search; none when absent. */
  search?: SessionSearchView;
  /** The event inspector, shown beside the cards while an event is open. */
  inspector?: React.ReactNode;
}

/**
 * A session's segments on the left and the exchanges of the chosen one on
 * the right, each exchange a request card and a response card. The host
 * gives the segments and the exchanges of the one shown. Without
 * `onOpenEvent` it is read only: the cards show their content, but no card
 * or entry opens its event.
 */
export function SessionStreamsView({
  segments,
  segment,
  exchanges,
  onSelectSegment,
  selectedEventId = null,
  anchoredEventId = null,
  anchoredExchangeId = null,
  search = noSearch,
  inspector,
  onOpenEvent,
  loadConversation,
  formatTime,
  formatDateTime,
  formatNumber,
  labels,
}: SessionStreamsViewProps) {
  const layout = React.useMemo(() => streamLayout(segments), [segments]);
  const selected = segment ?? segments[0]?.head ?? null;
  const cardsRef = React.useRef<HTMLDivElement>(null);
  useRevealMatch(cardsRef, search.active, search.revealRequest);
  const card: ExchangeCardContext = {
    onOpenEvent,
    loadConversation,
    formatTime,
    formatDateTime,
    formatNumber,
    labels,
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card className="overflow-hidden p-0 lg:sticky lg:top-14 lg:self-start">
        <div className="text-muted-foreground border-b px-3 py-2 text-xs">
          {labels.summary(segments.length)}
        </div>
        <StreamTimeline
          layout={layout}
          selected={selected}
          onSelect={onSelectSegment}
          formatTime={formatTime}
          formatDateTime={formatDateTime}
          formatNumber={formatNumber}
          labels={labels}
          matches={search.segmentMatches}
          className="max-h-[calc(100svh-8rem)]"
        />
      </Card>
      <div ref={cardsRef} className="flex min-w-0 items-start gap-4">
        {selected === null ? null : (
          <SegmentCards
            key={selected}
            head={selected}
            state={exchanges}
            ordinalOf={layout.ordinalOf}
            selectedEventId={selectedEventId}
            anchoredEventId={anchoredEventId}
            anchoredExchangeId={anchoredExchangeId}
            search={search}
            onSelectSegment={onSelectSegment}
            card={card}
          />
        )}
        {inspector ? (
          <div className="sticky top-14 flex h-[calc(100svh-4.5rem)] shrink-0">
            {inspector}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Scrolls to the occurrence being viewed each time it is asked to: to its
 * card until the card shows the match, then the match to the middle of the
 * viewport. Checking each frame lets the segment and the card load, and the
 * event be read in full, before the match is there.
 */
function useRevealMatch(
  containerRef: React.RefObject<HTMLElement | null>,
  active: StreamOccurrence | null,
  revealRequest: number,
) {
  const revealed = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (active === null || revealed.current === revealRequest) {
      return;
    }
    revealed.current = revealRequest;
    let frame = 0;
    let frames = 0;
    let centered = 0;
    let scrolledToCard = false;
    const look = () => {
      const container = containerRef.current;
      const mark = container?.querySelector<HTMLElement>("[data-active-match]");
      if (mark) {
        const rect = mark.getBoundingClientRect();
        const offset = rect.top + rect.height / 2 - window.innerHeight / 2;
        if (Math.abs(offset) > 1) {
          centered = 0;
          window.scrollTo({
            top: window.scrollY + offset,
            behavior: "instant",
          });
        } else if (++centered >= 2) {
          return;
        }
      } else if (!scrolledToCard) {
        const card = container?.querySelector<HTMLElement>(
          `article[data-event-id="${CSS.escape(active.eventPk)}"]`,
        );
        if (card) {
          scrolledToCard = true;
          const top = card.getBoundingClientRect().top + window.scrollY - 64;
          window.scrollTo({ top, behavior: "instant" });
        }
      }
      if (++frames < revealFrames) {
        frame = window.requestAnimationFrame(look);
      }
    };
    look();
    return () => window.cancelAnimationFrame(frame);
  }, [containerRef, active, revealRequest]);
}

const noExchanges: readonly SegmentExchange[] = [];

/** The exchanges of one segment, all at once. */
function SegmentCards({
  head,
  state,
  ordinalOf,
  selectedEventId,
  anchoredEventId,
  anchoredExchangeId,
  search,
  onSelectSegment,
  card,
}: {
  head: string;
  state: SegmentExchangesState;
  ordinalOf: ReadonlyMap<string, number>;
  selectedEventId: string | null;
  /** Stable event anchor to highlight and scroll to after its cards load. */
  anchoredEventId: string | null;
  /** Exchange fallback for an event grouped with another event on the same side. */
  anchoredExchangeId: string | null;
  search: SessionSearchView;
  onSelectSegment: (head: string) => void;
  card: ExchangeCardContext;
}) {
  const ready = state.status === "ready" ? state : null;
  // The host may build the state anew each render; its exchanges stay put.
  const loaded = ready?.exchanges ?? null;
  const exchanges = loaded ?? noExchanges;
  const contentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (anchoredEventId === null || loaded === null) return;
    const container = contentRef.current;
    const card =
      container?.querySelector<HTMLElement>(
        `article[data-event-id="${CSS.escape(anchoredEventId)}"]`,
      ) ??
      (anchoredExchangeId === null
        ? null
        : container?.querySelector<HTMLElement>(
            `section[data-exchange-id="${CSS.escape(anchoredExchangeId)}"]`,
          ));
    if (!card) return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({
        top: card.getBoundingClientRect().top + window.scrollY - 64,
        behavior: "instant",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [anchoredEventId, anchoredExchangeId, loaded]);
  const hasAnchoredCard = exchanges.some(
    (exchange) =>
      exchange.request_pk === anchoredEventId ||
      exchange.response_pk === anchoredEventId,
  );

  if (state.status === "error") {
    return (
      <Card>
        <CardContent className="text-destructive py-6 text-sm">
          {state.message}
        </CardContent>
      </Card>
    );
  }
  return (
    <div ref={contentRef} className="min-w-0 flex-1 space-y-3">
      {state.status === "loading" ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            {card.labels.loading}
          </CardContent>
        </Card>
      ) : null}
      {/* Exchanges off screen skip layout and paint, so a change in the column's
          width (the sidebar opening or collapsing) relays out only the ones in
          view. Until first shown an exchange counts as 450px tall, about the
          average; then it keeps its real height. */}
      {exchanges.map((exchange) => (
        <section
          key={exchange.id}
          data-exchange-id={exchange.id}
          data-anchored={
            (!hasAnchoredCard && exchange.id === anchoredExchangeId) ||
            undefined
          }
          className="data-[anchored]:ring-ring/60 space-y-2 [contain-intrinsic-size:auto_450px] [content-visibility:auto] data-[anchored]:rounded-xl data-[anchored]:ring-2"
        >
          <ExchangeLine
            exchange={exchange}
            segment={ready?.segment ?? head}
            ordinalOf={ordinalOf}
            onSelectSegment={onSelectSegment}
            labels={card.labels}
          />
          {(["request", "response"] as const).map((side) => {
            const eventPk =
              side === "request" ? exchange.request_pk : exchange.response_pk;
            return (
              <ExchangeCard
                key={side}
                side={side}
                exchange={exchange}
                selected={
                  eventPk !== null &&
                  eventPk === (selectedEventId ?? anchoredEventId)
                }
                query={search.query}
                matches={
                  eventPk === null ? undefined : search.matches?.get(eventPk)
                }
                activeMatch={
                  eventPk !== null && search.active?.eventPk === eventPk
                    ? search.active
                    : null
                }
                {...card}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}

/**
 * Where an exchange sits in its stream: the exchange it continues and by
 * which rule, with a link to that exchange's segment when it is another one,
 * or why it continues none.
 */
function ExchangeLine({
  exchange,
  segment,
  ordinalOf,
  onSelectSegment,
  labels,
}: {
  exchange: SegmentExchange;
  /** Head of the segment the exchange is shown in. */
  segment: string;
  ordinalOf: ReadonlyMap<string, number>;
  onSelectSegment: (head: string) => void;
  labels: SessionStreamsLabels;
}) {
  // Only a base in another segment gets a link there.
  const baseSegment =
    exchange.base_segment === segment ? null : exchange.base_segment;
  const segmentNumber =
    baseSegment === null ? undefined : ordinalOf.get(baseSegment);
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-2 text-xs">
      <span className="text-foreground font-mono" title={exchange.id}>
        {shortId(exchange.id)}
      </span>
      {exchange.base === null ? (
        <span>{labels.noBase(exchange.no_base_reason ?? "")}</span>
      ) : (
        <span title={exchange.base}>
          {labels.after(shortId(exchange.base), exchange.rule ?? "")}
          {baseSegment !== null && segmentNumber !== undefined ? (
            <>
              {" · "}
              <button
                type="button"
                className="text-ring underline-offset-4 hover:underline"
                onClick={() => onSelectSegment(baseSegment)}
              >
                {labels.continuesSegment(segmentNumber + 1)}
              </button>
            </>
          ) : null}
        </span>
      )}
    </div>
  );
}
