import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Card, CardContent } from "@lexmount.com/abyss-ui";
import * as React from "react";
import {
  fetchSessionSegment,
  type PreviewWindow,
  type SegmentExchange,
  type SessionStreamsResponse,
} from "@/api/usage";
import { useI18n } from "@/hooks/use-i18n";
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
}: {
  sessionPk: string;
  streams: SessionStreamsResponse;
  segment: string | null;
  /** The event open in the inspector, highlighted in the list. */
  selectedEventId: string | null;
  onSelectSegment: (head: string) => void;
  onSelectEvent: (eventPk: string) => void;
  formatTime: (value: string) => string;
}) {
  const { t } = useI18n();
  const layout = React.useMemo(() => streamLayout(streams.segments), [streams]);
  const selected = segment ?? streams.segments[0]?.head ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card className="overflow-hidden p-0 lg:sticky lg:top-4 lg:self-start">
        <div className="text-muted-foreground border-b px-3 py-2 text-xs">
          {t("sessions.streams.summary", { segments: streams.segments.length })}
        </div>
        <StreamTimeline
          layout={layout}
          selected={selected}
          onSelect={onSelectSegment}
          formatTime={formatTime}
          className="max-h-[calc(100svh-5rem)]"
        />
      </Card>
      {selected === null ? null : (
        <SegmentCards
          key={selected}
          sessionPk={sessionPk}
          head={selected}
          ordinalOf={layout.ordinalOf}
          selectedEventId={selectedEventId}
          onSelectSegment={onSelectSegment}
          onSelectEvent={onSelectEvent}
        />
      )}
    </div>
  );
}

/** The exchanges of one segment, a page at a time. */
function SegmentCards({
  sessionPk,
  head,
  ordinalOf,
  selectedEventId,
  onSelectSegment,
  onSelectEvent,
}: {
  sessionPk: string;
  head: string;
  ordinalOf: ReadonlyMap<string, number>;
  selectedEventId: string | null;
  onSelectSegment: (head: string) => void;
  onSelectEvent: (eventPk: string) => void;
}) {
  const { t } = useI18n();
  const query = useInfiniteQuery({
    queryKey: ["session-segment", sessionPk, head],
    queryFn: ({ pageParam }) =>
      fetchSessionSegment(sessionPk, head, CARD_WINDOW, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next ?? undefined,
  });
  const exchanges = query.data?.pages.flatMap((page) => page.exchanges) ?? [];

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
    <div className="min-w-0 space-y-3">
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
                onOpenEvent={onSelectEvent}
              />
            );
          })}
        </section>
      ))}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("sessions.streams.loadMore")}
        </Button>
      ) : null}
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
  ordinalOf,
  onSelectSegment,
}: {
  exchange: SegmentExchange;
  ordinalOf: ReadonlyMap<string, number>;
  onSelectSegment: (head: string) => void;
}) {
  const { t } = useI18n();
  const baseSegment = exchange.base_segment;
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
