import { useQuery } from "@tanstack/react-query";
import {
  SessionEventInspector,
  type SessionEventDetailState,
} from "@lexmount.com/abyss-ui";
import { ArrowLeft, Bot, Check, Copy } from "lucide-react";
import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchEventLocation,
  fetchSessionHeader,
  fetchSessionStreams,
  fetchUsageEvent,
  searchWithinSession,
  usageAttachmentUrl,
  type EventStreamLocation,
  type SessionHeaderResponse,
  type SessionStreamsResponse,
} from "@/api/usage";
import { apiErrorKind } from "@/api/http";
import { BaseLayout } from "@/components/layouts/base-layout";
import { QueryErrorCard } from "@/components/query-error";
import { Card, CardContent } from "@lexmount.com/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";
import { agentDisplayName } from "@/lib/agents";
import { eventInspectorLabels } from "@/lib/inspector-labels";
import { entryLabelText } from "@/lib/entry-label";
import {
  landingOccurrence,
  matchesBySegment,
  sessionMatches,
  streamOccurrences,
  type StreamOccurrence,
} from "@/lib/stream-search";
import { cn } from "@/lib/utils";
import { SessionStreamsView, type SessionSearchView } from "./session-streams-view";
import { StreamSearchBox, useDebounced } from "./stream-search-box";

/** Stable anchor, resolved to its current segment when the page opens. */
const eventSearchParam = "event";
const inspectSearchParam = "inspect";
/** Head of the open segment. */
const segmentSearchParam = "segment";
/** Search text, carried over from a session search and kept as it changes. */
const querySearchParam = "q";
const searchDebounceMs = 150;

export default function SessionDetailPage() {
  const { t, locale, formatDateTime, formatNumber } = useI18n();
  const { sessionPk = "" } = useParams<{ sessionPk: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const anchoredEventId = searchParams.get(eventSearchParam);
  const inspectedEventId = searchParams.get(inspectSearchParam);
  const segment = searchParams.get(segmentSearchParam);

  const headerQuery = useQuery({
    queryKey: ["session-header", sessionPk],
    queryFn: () => fetchSessionHeader(sessionPk),
    enabled: sessionPk !== "",
  });
  const streamsQuery = useQuery({
    queryKey: ["session-streams", sessionPk],
    queryFn: () => fetchSessionStreams(sessionPk),
    enabled: sessionPk !== "",
  });
  const locationQuery = useQuery({
    // A refreshed stream structure can move an event into a new segment.
    queryKey: [
      "event-location",
      sessionPk,
      anchoredEventId,
      streamsQuery.dataUpdatedAt,
    ],
    queryFn: () => fetchEventLocation(anchoredEventId ?? ""),
    enabled: anchoredEventId !== null && streamsQuery.data !== undefined,
  });
  const eventLocation =
    locationQuery.data?.session_pk === sessionPk ? locationQuery.data : undefined;
  const locatingEvent =
    anchoredEventId !== null &&
    streamsQuery.data !== undefined &&
    locationQuery.isPending;
  const header = headerQuery.data;
  const eventQuery = useQuery({
    queryKey: ["usage-event", inspectedEventId],
    queryFn: () => fetchUsageEvent(inspectedEventId ?? ""),
    enabled: inspectedEventId !== null,
    // Persisted events never change, so a loaded event stays valid.
    staleTime: Infinity,
  });

  // Navigations land in a later render, so a change made before the last one
  // has landed builds on that one rather than on the shown URL: the search's
  // text and the segment of the hit it shows can be written one right after
  // the other.
  const pendingParams = React.useRef<URLSearchParams | null>(null);
  React.useEffect(() => {
    pendingParams.current = null;
  }, [searchParams]);
  const updateParams = React.useCallback(
    (values: Record<string, string | null>, { replace = false } = {}) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(pendingParams.current ?? current);
          for (const [name, value] of Object.entries(values)) {
            if (value === null) {
              next.delete(name);
            } else {
              next.set(name, value);
            }
          }
          pendingParams.current = next;
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );
  const shownSegment =
    eventLocation?.segment ?? segment ?? streamsQuery.data?.segments[0]?.head ?? null;
  const search = useStreamSearch({
    sessionPk,
    streams: streamsQuery.data,
    initialQuery: searchParams.get(querySearchParam) ?? "",
    landingEventPk: anchoredEventId,
    onQueryChange: (query) =>
      updateParams({ [querySearchParam]: query || null }, { replace: true }),
    // Stepping or starting a new search is an explicit navigation.
    onReveal: (occurrence) => {
      updateParams(
        {
          [segmentSearchParam]: occurrence.segment,
          [eventSearchParam]: null,
          [inspectSearchParam]: null,
        },
        { replace: true },
      );
    },
  });

  // Below the summary the reader is in the exchanges, which get the room: the
  // sidebar folds to its icon rail, so the navigation stays at hand.
  const summaryRef = React.useRef<HTMLDivElement>(null);

  // Every segment and card shows a time, so the formatter is built once.
  const formatTime = React.useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { timeStyle: "medium" });
    return (value: string) => format.format(new Date(value));
  }, [locale]);

  // The inspector receives recorded fields; derived location is rendered by the host.
  const inspectedEvent = eventQuery.data ? { ...eventQuery.data } : null;
  if (inspectedEvent) delete inspectedEvent.location;
  const detail: SessionEventDetailState = eventQuery.isError
    ? { status: "error", message: t(`error.${apiErrorKind(eventQuery.error)}.title`) }
    : inspectedEvent
      ? { status: "ready", event: inspectedEvent }
      : { status: "loading" };
  const failed = headerQuery.isError
    ? headerQuery
    : streamsQuery.isError
      ? streamsQuery
      : locationQuery.isError
        ? locationQuery
        : null;

  return (
    <BaseLayout sidebar={{ collapsible: "icon" }} foldSidebarWhileAway={summaryRef}>
      <div className="space-y-5 px-4 lg:px-6">
        <div ref={summaryRef} className="grid gap-4">
          <Link
            to="/dashboard"
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            {t("sessions.back")}
          </Link>
          <SessionIdentity header={header} />
          {header ? (
            <SessionStats header={header} formatDateTime={formatDateTime} />
          ) : null}
        </div>

        {failed ? (
          <QueryErrorCard
            error={failed.error}
            title={
              failed !== locationQuery && apiErrorKind(failed.error) === "notFound"
                ? t("sessions.detail.notFound")
                : undefined
            }
            retrying={failed.isFetching}
            onRetry={() => void failed.refetch()}
          />
        ) : null}

        {streamsQuery.isLoading || locatingEvent ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              {t("sessions.detail.loading")}
            </CardContent>
          </Card>
        ) : null}

        {streamsQuery.data && !locatingEvent ? (
          <div>
            {/* The search spans the whole session, so it sits above the
                timeline and the cards, and stays in view as the page scrolls. */}
            <div className="bg-background sticky top-0 z-20 pb-3">
              <StreamSearchBox
                query={search.query}
                onQueryChange={search.setQuery}
                status={search.status}
                position={search.position}
                total={search.total}
                truncated={search.truncated}
                onStep={search.step}
              />
            </div>
            <SessionStreamsView
              sessionPk={sessionPk}
              streams={streamsQuery.data}
              segment={shownSegment}
              anchoredEventId={eventLocation?.event_pk ?? null}
              anchoredExchangeId={eventLocation?.exchange ?? null}
              selectedEventId={inspectedEventId}
              onSelectSegment={(head) =>
                updateParams({
                  [segmentSearchParam]: head,
                  [eventSearchParam]: null,
                  [inspectSearchParam]: null,
                })
              }
              onSelectEvent={(eventPk) =>
                updateParams({ [inspectSearchParam]: eventPk }, { replace: true })
              }
              formatTime={formatTime}
              search={search.view}
              inspector={
                inspectedEventId === null ? null : (
                  <SessionEventInspector
                    key={inspectedEventId}
                    detail={detail}
                    properties={
                      <EventLocationProperties
                        location={eventQuery.data?.location}
                        sessionPk={sessionPk}
                        eventPk={inspectedEventId}
                      />
                    }
                    onClose={() =>
                      updateParams({ [inspectSearchParam]: null }, { replace: true })
                    }
                    attachmentUrl={usageAttachmentUrl}
                    formatDateTime={formatDateTime}
                    formatNumber={formatNumber}
                    labels={eventInspectorLabels(t)}
                  />
                )
              }
            />
          </div>
        ) : null}
      </div>
    </BaseLayout>
  );
}

/** Derived location is supplied by the event response, without another lookup. */
function EventLocationProperties({
  location,
  sessionPk,
  eventPk,
}: {
  location: EventStreamLocation | null | undefined;
  sessionPk: string;
  eventPk: string;
}) {
  const { t, formatNumber } = useI18n();
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-1.5 border-b p-4 text-xs">
      <dt className="text-muted-foreground">{t("sessions.event.segment")}</dt>
      <dd>
        <Link
          to={`/sessions/${encodeURIComponent(sessionPk)}?event=${encodeURIComponent(eventPk)}`}
          className="text-ring underline-offset-4 hover:underline"
        >
          {location
            ? t("sessions.event.segmentNumber", {
                number: formatNumber(location.segment_index),
              })
            : t("sessions.event.locate")}
        </Link>
      </dd>
      {location ? (
        <>
          <dt className="text-muted-foreground">{t("sessions.event.segmentId")}</dt>
          <dd className="font-mono break-all">{location.segment}</dd>
          <dt className="text-muted-foreground">{t("sessions.event.exchangeId")}</dt>
          <dd className="font-mono break-all">{location.exchange}</dd>
        </>
      ) : null}
    </dl>
  );
}

/**
 * The search within a session: the text typed, where the backend finds it
 * once it has settled, and the occurrence being viewed. Stepping reveals an
 * occurrence; a new search starts at its first one, and the search the page
 * opened with on an event starts in that event, when it has a hit: at its
 * first hit in what the event added, or else its first in the context.
 */
function useStreamSearch({
  sessionPk,
  streams,
  initialQuery,
  landingEventPk,
  onQueryChange,
  onReveal,
}: {
  sessionPk: string;
  streams: SessionStreamsResponse | undefined;
  initialQuery: string;
  /** The event the page opened on with its search, or null. */
  landingEventPk: string | null;
  /** Reports the settled search text, so the page can keep it in its URL. */
  onQueryChange: (query: string) => void;
  /** Shows the segment an occurrence is in. */
  onReveal: (occurrence: StreamOccurrence) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState(initialQuery);
  const searchQuery = useDebounced(query.trim(), searchDebounceMs);
  const searching = searchQuery.length > 0;

  // The settled text is reported only when it changes, not for the text the
  // page opened with.
  const callbacks = React.useRef({ onQueryChange, onReveal });
  React.useEffect(() => {
    callbacks.current = { onQueryChange, onReveal };
  });
  const reportedQuery = React.useRef(searchQuery);
  React.useEffect(() => {
    if (reportedQuery.current !== searchQuery) {
      reportedQuery.current = searchQuery;
      callbacks.current.onQueryChange(searchQuery);
    }
  }, [searchQuery]);

  // New exchanges search again.
  const exchangeCount = streams?.segments.reduce(
    (sum, segment) => sum + segment.exchange_count,
    0,
  );
  const resultQuery = useQuery({
    queryKey: ["session-search", sessionPk, searchQuery, exchangeCount],
    queryFn: ({ signal }) => searchWithinSession(sessionPk, searchQuery, { signal }),
    enabled: searching && streams !== undefined,
    staleTime: Infinity,
  });
  const result = searching ? resultQuery.data : undefined;
  const matches = React.useMemo(
    () => (result ? sessionMatches(result) : null),
    [result],
  );
  const segments = React.useMemo(
    () => streams?.segments.map((segment) => segment.head) ?? [],
    [streams],
  );
  const occurrences = React.useMemo(
    () => (result ? streamOccurrences(segments, result) : []),
    [result, segments],
  );
  const segmentMatches = React.useMemo(
    () => (result ? matchesBySegment(occurrences) : null),
    [result, occurrences],
  );

  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [revealRequest, setRevealRequest] = React.useState(0);
  const show = React.useCallback((occurrence: StreamOccurrence) => {
    callbacks.current.onReveal(occurrence);
    setRevealRequest((current) => current + 1);
  }, []);

  // Where a search starts, once its occurrences are known.
  const opening = React.useRef({ query: initialQuery.trim(), eventPk: landingEventPk });
  const started = React.useRef<string | null>(null);
  const ready = result !== undefined;
  React.useEffect(() => {
    if (!searching) {
      started.current = null;
      setActiveIndex(-1);
      return;
    }
    if (!ready || started.current === searchQuery) {
      return;
    }
    started.current = searchQuery;
    const { query: openedWith, eventPk } = opening.current;
    opening.current = { query: "", eventPk: null };
    if (openedWith === searchQuery && eventPk !== null) {
      // Without a match in the event, the view stays until the reader steps.
      const first = landingOccurrence(occurrences, eventPk);
      setActiveIndex(first);
      if (first !== -1) {
        setRevealRequest((current) => current + 1);
      }
      return;
    }
    setActiveIndex(occurrences.length > 0 ? 0 : -1);
    if (occurrences.length > 0) {
      show(occurrences[0]);
    }
  }, [searching, ready, searchQuery, occurrences, show]);

  const total = occurrences.length;
  const active = occurrences[activeIndex] ?? null;
  const step = (delta: number) => {
    if (total === 0) {
      return;
    }
    const next =
      active === null
        ? delta > 0
          ? 0
          : total - 1
        : (activeIndex + delta + total) % total;
    setActiveIndex(next);
    show(occurrences[next]);
  };

  const status = !searching
    ? null
    : resultQuery.isError
      ? t(`error.${apiErrorKind(resultQuery.error)}.title`)
      : !ready
        ? t("sessions.streams.searchLoading")
        : null;
  const view = React.useMemo(
    (): SessionSearchView => ({
      query: result ? searchQuery : "",
      matches,
      segmentMatches,
      active,
      revealRequest,
    }),
    [result, searchQuery, matches, segmentMatches, active, revealRequest],
  );
  return {
    query,
    setQuery,
    status,
    position: active === null ? 0 : activeIndex + 1,
    total,
    truncated: result?.truncated ?? false,
    step,
    view,
  };
}

function SessionIdentity({ header }: { header: SessionHeaderResponse | undefined }) {
  const { t } = useI18n();
  const agent = header?.agents[0];
  const title = entryLabelText(header?.title) ?? header?.session_id;
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <div className="bg-ring/10 text-ring ring-ring/20 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1">
        <Bot className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight" title={title}>
            {title ?? t("sessions.detail.title")}
          </h1>
        </div>
        {header ? (
          <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 font-mono text-xs">
            {agent ? (
              <span className="shrink-0 font-sans">
                {agentDisplayName(agent.name)}
                {agent.version ? ` v${agent.version}` : ""} ·
              </span>
            ) : null}
            <span className="truncate">{header.session_id}</span>
            <CopyButton value={header.session_id} label={t("sessions.detail.copyId")} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={copied ? t("sessions.detail.copied") : label}
      title={copied ? t("sessions.detail.copied") : label}
      className="hover:text-foreground hover:bg-accent shrink-0 rounded p-1 transition-colors"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? (
        <Check className="text-ring size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

/** Headline facts about the session in one strip. */
function SessionStats({
  header,
  formatDateTime,
}: {
  header: SessionHeaderResponse;
  formatDateTime: (value: string) => string;
}) {
  const { t, formatNumber } = useI18n();
  const stats = [
    { label: t("sessions.detail.startedAt"), value: formatDateTime(header.start) },
    {
      label: t("sessions.detail.duration"),
      value: formatDuration(header.start, header.end, t),
    },
    {
      label: t("sessions.detail.turnCount"),
      // Requests that open a turn, as the session list counts them.
      value: formatNumber(header.turn_count),
    },
    {
      label: t("sessions.detail.exchangeCount"),
      value: formatNumber(header.exchange_count),
    },
    { label: t("common.tokens"), value: formatNumber(header.tokens.total) },
    {
      label: t("sessions.detail.model"),
      value: header.models.join(", ") || "—",
      title: header.models.join("\n"),
      mono: true,
    },
  ];
  return (
    <dl className="bg-card grid grid-cols-2 overflow-hidden rounded-xl border shadow-xs md:grid-cols-6">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={cn("min-w-0 px-4 py-3", index > 0 && "md:border-l")}
        >
          <dt className="text-muted-foreground text-xs">{stat.label}</dt>
          <dd
            className={cn(
              "mt-1 truncate text-sm font-medium tabular-nums",
              stat.mono && "font-mono text-[13px]",
            )}
            title={stat.title}
          >
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function formatDuration(
  startedAt: string,
  endedAt: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const minutes = Math.floor(
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000,
  );
  if (minutes < 1) {
    return t("sessions.detail.durationUnderMinute");
  }
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? t("sessions.detail.durationHours", { hours, minutes: minutes % 60 })
    : t("sessions.detail.durationMinutes", { minutes });
}
