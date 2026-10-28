import * as React from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "../components/button";
import { Card, CardContent } from "../components/card";
import {
  ExchangeCard,
  previewCharacters,
  type ExchangeCardContext,
} from "./exchange-card";
import type { SessionMatches, StreamOccurrence } from "./search";
import { TurnTimeline } from "./turn-timeline";
import { turnHead } from "./turns";
import type { SegmentExchange, SessionTurn, StreamSegment } from "./types";

/**
 * What a card shows of each request and response before it is expanded: the
 * first few entries, each text as far as a collapsed entry draws from. The
 * host asks for a segment's exchanges with this preview window.
 */
export const exchangePreviewWindow = {
  entries: "0-2",
  textPreview: previewCharacters,
} as const;

/**
 * Frames a match being revealed is looked for, while its segment and card
 * load and, past the preview, its event is read in full.
 */
const revealFrames = 600;

/** The exchanges of a segment shown, as the host has them. */
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

/** A segment shown, and its exchanges as the host has them. */
export interface ShownSegment {
  head: string;
  state: SegmentExchangesState;
}

export interface SessionStreamsViewProps extends ExchangeCardContext {
  /** The session's segments, in session order. */
  segments: readonly StreamSegment[];
  /** The session's turns, the timeline's rows. */
  turns: readonly SessionTurn[];
  /**
   * Head of the segment chosen; the first turn's when null. The timeline
   * marks the turn, executor, and side request it is in.
   */
  segment: string | null;
  /**
   * The segments shown, in order, with `exchangePreviewWindow` previews:
   * what `shownSegments` gives for the segment chosen.
   */
  exchanges: readonly ShownSegment[];
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
 * A session's turns on the left and the exchanges of the segments chosen on
 * the right, each exchange a request card and a response card: an executor's
 * whole main line, or one side request. The host gives the turns, the
 * segments, and the exchanges of those shown. Without
 * `onOpenEvent` it is read only: the cards show their content, but no card
 * or entry opens its event.
 */
export function SessionStreamsView({
  segments,
  turns,
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
  const segmentOf = React.useMemo(
    () => new Map(segments.map((item) => [item.head, item])),
    [segments],
  );
  const selected =
    segment ??
    (turns[0] === undefined ? undefined : turnHead(turns[0])) ??
    segments[0]?.head ??
    null;
  const cardsRef = React.useRef<HTMLDivElement>(null);
  useRevealMatch(cardsRef, search.active, search.revealRequest);
  const columnRef = React.useRef<HTMLDivElement>(null);
  const held = useHeldHeight(
    columnRef,
    exchanges.some(({ state }) => state.status === "loading"),
  );
  const viewRef = React.useRef<HTMLDivElement>(null);
  const scrolledPast = useScrolledPast(viewRef);
  const card: ExchangeCardContext = {
    onOpenEvent,
    loadConversation,
    formatTime,
    formatDateTime,
    formatNumber,
    labels,
  };

  return (
    <div
      ref={viewRef}
      className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]"
    >
      <Card className="overflow-hidden p-0 lg:sticky lg:top-14 lg:self-start">
        <div className="text-muted-foreground border-b px-3 py-2 text-xs">
          {labels.summary(turns.filter((turn) => turn.turn !== null).length)}
        </div>
        <TurnTimeline
          turns={turns}
          segmentOf={segmentOf}
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
        {/* Short of room, the inspector gives way before the cards do, down
            to its own floor; the cards keep theirs. */}
        <div
          ref={columnRef}
          className="min-w-[min(28rem,calc(50%-0.5rem))] flex-1 space-y-3"
          style={{ minHeight: held }}
        >
          {exchanges.map(({ head, state }, index) => (
            <React.Fragment key={head}>
              {/* Segments of one main line follow each other, apart. */}
              {index > 0 ? (
                <div
                  data-segment-divider
                  className="border-t border-dashed pt-1"
                />
              ) : null}
              <SegmentCards
                head={head}
                state={state}
                selectedEventId={selectedEventId}
                anchoredEventId={anchoredEventId}
                anchoredExchangeId={anchoredExchangeId}
                search={search}
                card={card}
              />
            </React.Fragment>
          ))}
          {scrolledPast ? (
            // Takes no room: it floats at the column's lower right.
            <div className="pointer-events-none sticky bottom-6 h-0">
              <Button
                variant="outline"
                size="icon"
                className="pointer-events-auto absolute right-0 bottom-0 rounded-full shadow-md"
                aria-label={labels.backToTop}
                title={labels.backToTop}
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
        {inspector ? (
          <div className="sticky top-14 flex h-[calc(100svh-4.5rem)] min-w-[min(20rem,calc(50%-0.5rem))] shrink">
            {inspector}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Whether the page has scrolled past the top of `ref`'s element. */
function useScrolledPast(ref: React.RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = React.useState(false);
  React.useEffect(() => {
    const update = () => {
      const top = ref.current?.getBoundingClientRect().top;
      setPast(top !== undefined && top < 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [ref]);
  return past;
}

/**
 * The height to hold a column at while its content loads: the height it had
 * when it last showed loaded content. Moving to another turn then leaves the
 * page where it is, rather than the page shrinking to a loading card and the
 * browser pulling the scroll up with it.
 */
function useHeldHeight(
  columnRef: React.RefObject<HTMLElement | null>,
  loading: boolean,
): number | undefined {
  // Measured only while loaded, so the height the render after holds is
  // there before anything lays the shrunk column out.
  const [loadedHeight, setLoadedHeight] = React.useState<number>();
  React.useLayoutEffect(() => {
    const column = columnRef.current;
    if (loading || !column || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() =>
      setLoadedHeight(column.offsetHeight),
    );
    observer.observe(column);
    return () => observer.disconnect();
  }, [columnRef, loading]);
  return loading ? loadedHeight : undefined;
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
  selectedEventId,
  anchoredEventId,
  anchoredExchangeId,
  search,
  card,
}: {
  head: string;
  state: SegmentExchangesState;
  selectedEventId: string | null;
  /** Stable event anchor to highlight and scroll to after its cards load. */
  anchoredEventId: string | null;
  /** Exchange fallback for an event grouped with another event on the same side. */
  anchoredExchangeId: string | null;
  search: SessionSearchView;
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
    <div
      ref={contentRef}
      data-segment-cards={head}
      className="min-w-0 space-y-3"
    >
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
