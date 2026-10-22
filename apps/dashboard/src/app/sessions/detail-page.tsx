import { useQuery } from "@tanstack/react-query";
import {
  SessionEventInspector,
  type SessionEventDetailState,
} from "@lexmount.com/abyss-ui";
import { ArrowLeft, Bot, Check, Copy } from "lucide-react";
import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchSessionHeader,
  fetchSessionStreams,
  fetchUsageEvent,
  searchWithinSession,
  usageAttachmentUrl,
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

const eventSearchParam = "event";
/** Head of the open segment. */
const segmentSearchParam = "segment";
/** Search text, carried over from a session search and kept as it changes. */
const querySearchParam = "q";
const searchDebounceMs = 150;

export default function SessionDetailPage() {
  const { t, locale, formatDateTime, formatNumber } = useI18n();
  const { sessionPk = "" } = useParams<{ sessionPk: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedEventId = searchParams.get(eventSearchParam);
  const segment = searchParams.get(segmentSearchParam);
  // A search carried over from the sessions page names the event of its hit:
  // the page opens in that event's segment and starts the search there,
  // without opening the event.
  const [landingEventPk, setLandingEventPk] = React.useState(() =>
    searchParams.has(querySearchParam) && !searchParams.has(segmentSearchParam)
      ? selectedEventId
      : null,
  );
  // Once the URL no longer names it, the event is an event like any other.
  if (landingEventPk !== null && selectedEventId !== landingEventPk) {
    setLandingEventPk(null);
  }
  const inspectedEventId =
    landingEventPk !== null && selectedEventId === landingEventPk
      ? null
      : selectedEventId;

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
  const updateParam = React.useCallback(
    (name: string, value: string | null) =>
      updateParams({ [name]: value }, { replace: name === eventSearchParam }),
    [updateParams],
  );

  const shownSegment = segment ?? streamsQuery.data?.segments[0]?.head ?? null;
  const search = useStreamSearch({
    sessionPk,
    streams: streamsQuery.data,
    initialQuery: searchParams.get(querySearchParam) ?? "",
    landingEventPk,
    onQueryChange: (query) =>
      updateParams({ [querySearchParam]: query || null }, { replace: true }),
    // A match in another segment shows that segment.
    onReveal: (occurrence) => {
      if (occurrence.segment !== shownSegment) {
        updateParams({ [segmentSearchParam]: occurrence.segment }, { replace: true });
      }
    },
    // The event a search opened on gives way to the segment of its hit.
    onLanded: (head) => {
      updateParams(
        {
          [eventSearchParam]: null,
          ...(head === null ? {} : { [segmentSearchParam]: head }),
        },
        { replace: true },
      );
    },
  });

  const summaryRef = React.useRef<HTMLDivElement>(null);
  useFoldSidebarOnScroll(summaryRef);

  // Every segment and card shows a time, so the formatter is built once.
  const formatTime = React.useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { timeStyle: "medium" });
    return (value: string) => format.format(new Date(value));
  }, [locale]);

  const detail: SessionEventDetailState = eventQuery.isError
    ? { status: "error", message: t(`error.${apiErrorKind(eventQuery.error)}.title`) }
    : eventQuery.data
      ? { status: "ready", event: eventQuery.data }
      : { status: "loading" };
  const failed = headerQuery.isError
    ? headerQuery
    : streamsQuery.isError
      ? streamsQuery
      : null;

  return (
    <BaseLayout>
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
              apiErrorKind(failed.error) === "notFound"
                ? t("sessions.detail.notFound")
                : undefined
            }
            retrying={failed.isFetching}
            onRetry={() => void failed.refetch()}
          />
        ) : null}

        {streamsQuery.isLoading ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              {t("sessions.detail.loading")}
            </CardContent>
          </Card>
        ) : null}

        {streamsQuery.data ? (
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
              segment={segment}
              selectedEventId={inspectedEventId}
              onSelectSegment={(head) => updateParam(segmentSearchParam, head)}
              onSelectEvent={(eventPk) => updateParam(eventSearchParam, eventPk)}
              formatTime={formatTime}
              search={search.view}
              inspector={
                inspectedEventId === null ? null : (
                  <SessionEventInspector
                    key={inspectedEventId}
                    detail={detail}
                    onClose={() => updateParam(eventSearchParam, null)}
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
  onLanded,
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
  /** The search opened on an event has started, in the segment given if any. */
  onLanded: (segment: string | null) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState(initialQuery);
  const searchQuery = useDebounced(query.trim(), searchDebounceMs);
  const searching = searchQuery.length > 0;

  // The settled text is reported only when it changes, not for the text the
  // page opened with.
  const callbacks = React.useRef({ onQueryChange, onReveal, onLanded });
  React.useEffect(() => {
    callbacks.current = { onQueryChange, onReveal, onLanded };
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
      callbacks.current.onLanded(first === -1 ? null : occurrences[first].segment);
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

/**
 * Folds the sidebar away as the session summary scrolls out of view: the
 * sidebar slides out and the content widens with it, in step with the
 * scroll. A sidebar left half folded when scrolling stops eases to its nearer
 * end. The sidebar's own open state is untouched.
 */
function useFoldSidebarOnScroll(summaryRef: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const summary = summaryRef.current;
    const wrapper = summary?.closest<HTMLElement>('[data-slot="sidebar-wrapper"]');
    if (!summary || !wrapper) return;
    // Queried each time: the desktop sidebar remounts across the mobile
    // breakpoint.
    const parts = () =>
      wrapper.querySelectorAll<HTMLElement>(
        ':scope > [data-slot="sidebar"] > [data-slot="sidebar-gap"], :scope > [data-slot="sidebar"] > [data-slot="sidebar-container"], :scope > [data-slot="sidebar-inset"]',
      );

    // Fully folded once the summary is gone, or at the end of the page if
    // that comes first. Measured only when sizes change, so reading it while
    // scrolling never forces a layout.
    let distance = 0;
    const measure = () => {
      distance = Math.min(
        summary.getBoundingClientRect().bottom + window.scrollY,
        document.documentElement.scrollHeight - window.innerHeight,
      );
    };
    const progress = () =>
      distance > 0 ? Math.min(Math.max(window.scrollY / distance, 0), 1) : 0;

    let frame = 0;
    let idle = 0;
    const render = (fold: number, mode: "tracking" | "settling") => {
      for (const part of parts()) {
        part.setAttribute("data-sidebar-fold", mode);
        part.style.setProperty("--sidebar-fold", fold.toFixed(3));
      }
    };
    const clear = () => {
      for (const part of parts()) {
        part.removeAttribute("data-sidebar-fold");
        part.style.removeProperty("--sidebar-fold");
      }
    };
    const update = () => {
      frame = 0;
      const p = progress();
      // Responds at once, then eases into the fully folded end.
      render(1 - (1 - p) * (1 - p), "tracking");
    };
    const settle = () => {
      const p = progress();
      // Back at the top, hand the sidebar back to its own toggle animation.
      if (p === 0) clear();
      else if (p < 1) render(p < 0.5 ? 0 : 1, "settling");
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
      window.clearTimeout(idle);
      idle = window.setTimeout(settle, 160);
    };

    // Only remeasure: folding itself resizes the summary, and reacting to
    // that would undo a settle.
    const resize = new ResizeObserver(measure);
    resize.observe(summary);
    resize.observe(document.documentElement);
    measure();
    if (window.scrollY > 0) update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(idle);
      clear();
    };
  }, [summaryRef]);
}

function SessionIdentity({ header }: { header: SessionHeaderResponse | undefined }) {
  const { t } = useI18n();
  const agent = header?.agents[0];
  // The first request's user words, else the session id.
  const title = header?.title?.text ?? header?.session_id;
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
    { label: t("sessions.detail.turnCount"), value: formatNumber(header.turn_count) },
    {
      label: t("sessions.streams.counts"),
      value: t("sessions.streams.countsValue", {
        segments: formatNumber(header.segment_count),
        exchanges: formatNumber(header.exchange_count),
      }),
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
