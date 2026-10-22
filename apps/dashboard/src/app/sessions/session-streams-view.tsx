import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@lexmount.com/abyss-ui";
import * as React from "react";
import {
  fetchSessionSegment,
  type PreviewWindow,
  type SegmentExchange,
  type SessionStreamsResponse,
} from "@/api/usage";
import { useI18n } from "@/hooks/use-i18n";
import type { SessionMatches, StreamOccurrence } from "@/lib/stream-search";
import { streamLayout } from "@/lib/streams";
import { ExchangeCard, previewCharacters } from "./exchange-card";
import { StreamTimeline } from "./stream-timeline";

/**
 * What a card shows of each request and response before it is expanded: the
 * first few entries, each text as far as a collapsed entry draws from.
 */
const CARD_WINDOW: PreviewWindow = { entries: "0-2", textPreview: previewCharacters };

/** Leading characters of an exchange id, enough to tell them apart. */
const shortId = (id: string) => id.slice(0, 14);

/**
 * Frames a match being revealed is looked for, while its segment and card
 * load and, past the preview, its event is read in full.
 */
const revealFrames = 600;

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

/**
 * A session's segments on the left and the exchanges of the chosen one on
 * the right, each exchange a request card and a response card.
 */
export function SessionStreamsView({
  sessionPk,
  streams,
  segment,
  selectedEventId,
  onSelectSegment,
  onSelectEvent,
  formatTime,
  search,
  inspector,
}: {
  sessionPk: string;
  streams: SessionStreamsResponse;
  segment: string | null;
  /** The event open in the inspector, highlighted in the list. */
  selectedEventId: string | null;
  onSelectSegment: (head: string) => void;
  onSelectEvent: (eventPk: string) => void;
  formatTime: (value: string) => string;
  search: SessionSearchView;
  /** The event inspector, shown beside the cards while an event is open. */
  inspector: React.ReactNode;
}) {
  const { t } = useI18n();
  const layout = React.useMemo(() => streamLayout(streams.segments), [streams]);
  const selected = segment ?? streams.segments[0]?.head ?? null;
  const cardsRef = React.useRef<HTMLDivElement>(null);
  useRevealMatch(cardsRef, search.active, search.revealRequest);

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card className="overflow-hidden p-0 lg:sticky lg:top-14 lg:self-start">
        <div className="text-muted-foreground border-b px-3 py-2 text-xs">
          {t("sessions.streams.summary", { segments: streams.segments.length })}
        </div>
        <StreamTimeline
          layout={layout}
          selected={selected}
          onSelect={onSelectSegment}
          formatTime={formatTime}
          matches={search.segmentMatches}
          className="max-h-[calc(100svh-8rem)]"
        />
      </Card>
      <div ref={cardsRef} className="flex min-w-0 items-start gap-4">
        {selected === null ? null : (
          <SegmentCards
            key={selected}
            sessionPk={sessionPk}
            head={selected}
            ordinalOf={layout.ordinalOf}
            selectedEventId={selectedEventId}
            search={search}
            onSelectSegment={onSelectSegment}
            onSelectEvent={onSelectEvent}
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
  const revealed = React.useRef(revealRequest);
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
          window.scrollTo({ top: window.scrollY + offset, behavior: "instant" });
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

/** The exchanges of one segment, all at once. */
function SegmentCards({
  sessionPk,
  head,
  ordinalOf,
  selectedEventId,
  search,
  onSelectSegment,
  onSelectEvent,
}: {
  sessionPk: string;
  head: string;
  ordinalOf: ReadonlyMap<string, number>;
  selectedEventId: string | null;
  search: SessionSearchView;
  onSelectSegment: (head: string) => void;
  onSelectEvent: (eventPk: string) => void;
}) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["session-segment", sessionPk, head],
    queryFn: () => fetchSessionSegment(sessionPk, head, CARD_WINDOW),
  });
  const exchanges = query.data?.exchanges ?? [];

  if (query.isError) {
    return (
      <Card>
        <CardContent className="text-destructive py-6 text-sm">
          {query.error.message}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="min-w-0 flex-1 space-y-3">
      {query.isLoading ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            {t("sessions.detail.loading")}
          </CardContent>
        </Card>
      ) : null}
      {exchanges.map((exchange) => (
        <section key={exchange.id} className="space-y-2">
          <ExchangeLine
            exchange={exchange}
            segment={query.data?.segment ?? head}
            ordinalOf={ordinalOf}
            onSelectSegment={onSelectSegment}
          />
          {(["request", "response"] as const).map((side) => {
            const eventPk =
              side === "request" ? exchange.request_pk : exchange.response_pk;
            return (
              <ExchangeCard
                key={side}
                side={side}
                exchange={exchange}
                selected={eventPk !== null && eventPk === selectedEventId}
                query={search.query}
                matches={eventPk === null ? undefined : search.matches?.get(eventPk)}
                activeMatch={
                  eventPk !== null && search.active?.eventPk === eventPk
                    ? search.active
                    : null
                }
                onOpenEvent={onSelectEvent}
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
 * or why it continues none; and whether its request opens a turn.
 */
function ExchangeLine({
  exchange,
  segment,
  ordinalOf,
  onSelectSegment,
}: {
  exchange: SegmentExchange;
  /** Head of the segment the exchange is shown in. */
  segment: string;
  ordinalOf: ReadonlyMap<string, number>;
  onSelectSegment: (head: string) => void;
}) {
  const { t } = useI18n();
  // Only a base in another segment gets a link there.
  const baseSegment = exchange.base_segment === segment ? null : exchange.base_segment;
  const segmentNumber = baseSegment === null ? undefined : ordinalOf.get(baseSegment);
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-2 text-xs">
      <span className="text-foreground font-mono" title={exchange.id}>
        {shortId(exchange.id)}
      </span>
      {exchange.starts_turn ? (
        <span className="text-ring font-medium">{t("sessions.streams.newTurn")}</span>
      ) : null}
      {exchange.base === null ? (
        <span>
          {t("sessions.streams.noBase", { reason: exchange.no_base_reason ?? "" })}
        </span>
      ) : (
        <span title={exchange.base}>
          {t("sessions.streams.after", {
            exchange: shortId(exchange.base),
            rule: exchange.rule ?? "",
          })}
          {baseSegment !== null && segmentNumber !== undefined ? (
            <>
              {" · "}
              <button
                type="button"
                className="text-ring underline-offset-4 hover:underline"
                onClick={() => onSelectSegment(baseSegment)}
              >
                {t("sessions.streams.continuesSegment", { number: segmentNumber + 1 })}
              </button>
            </>
          ) : null}
        </span>
      )}
    </div>
  );
}
