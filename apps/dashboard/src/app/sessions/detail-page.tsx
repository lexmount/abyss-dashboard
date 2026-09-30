import { useQuery } from "@tanstack/react-query";
import {
  SessionEventInspector,
  SessionTrajectory,
  type SessionEventDetailState,
  type SessionEventInspectorLabels,
  type SessionTrajectoryLabels,
} from "@lexmount.com/abyss-ui";
import { ArrowLeft, Bot, Check, Copy, Info } from "lucide-react";
import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchSessionTrajectory,
  fetchUsageEvent,
  usageAttachmentUrl,
  type SessionInfo,
} from "@/api/usage";
import { apiErrorKind } from "@/api/http";
import { BaseLayout } from "@/components/layouts/base-layout";
import { QueryErrorCard } from "@/components/query-error";
import { SessionPurposeBadge } from "@/components/session-purpose-badge";
import { Badge, Button } from "@lexmount.com/abyss-ui";
import { Popover, PopoverContent, PopoverTrigger } from "@lexmount.com/abyss-ui";
import { Card, CardContent } from "@lexmount.com/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";
import { agentDisplayName } from "@/lib/agents";
import { cn } from "@/lib/utils";

const eventSearchParam = "event";
const turnSearchParam = "turn";

export default function SessionDetailPage() {
  const { t, locale, formatDateTime, formatNumber } = useI18n();
  const { sessionPk } = useParams<{ sessionPk: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedEventId = searchParams.get(eventSearchParam);
  const turnParam = Number.parseInt(searchParams.get(turnSearchParam) ?? "", 10);
  const focusedTurn = Number.isNaN(turnParam) ? null : turnParam;

  const trajectoryQuery = useQuery({
    queryKey: ["session-trajectory", sessionPk],
    queryFn: () => fetchSessionTrajectory(sessionPk ?? ""),
    enabled: Boolean(sessionPk),
  });
  const trajectory = trajectoryQuery.data;
  const session = trajectory?.session;
  const eventQuery = useQuery({
    queryKey: ["usage-event", selectedEventId],
    queryFn: () => fetchUsageEvent(selectedEventId ?? ""),
    enabled: selectedEventId !== null,
    // Persisted events never change, so a loaded event stays valid.
    staleTime: Infinity,
  });

  const updateParam = React.useCallback(
    (name: string, value: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value === null) {
            next.delete(name);
          } else {
            next.set(name, value);
          }
          return next;
        },
        { replace: name === eventSearchParam },
      );
    },
    [setSearchParams],
  );

  const formatTime = React.useCallback(
    (value: string) =>
      new Intl.DateTimeFormat(locale, { timeStyle: "medium" }).format(new Date(value)),
    [locale],
  );

  const detail: SessionEventDetailState = eventQuery.isError
    ? { status: "error", message: t(`error.${apiErrorKind(eventQuery.error)}.title`) }
    : eventQuery.data
      ? { status: "ready", event: eventQuery.data }
      : { status: "loading" };

  const turnCount = trajectory
    ? new Set(trajectory.items.map((item) => item.turn_index)).size
    : null;
  const models = trajectory?.items.map((item) => item.llm_model) ?? [];

  return (
    <BaseLayout>
      <div className="space-y-5 px-4 lg:px-6">
        <div className="grid gap-4">
          <Link
            to="/dashboard"
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            {t("sessions.back")}
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <SessionIdentity session={session} />
            {session ? (
              <SessionDetails session={session} formatDateTime={formatDateTime} />
            ) : null}
          </div>
          {session ? (
            <SessionStats session={session} turnCount={turnCount} models={models} />
          ) : null}
        </div>

        {trajectoryQuery.isError ? (
          <QueryErrorCard
            error={trajectoryQuery.error}
            title={
              apiErrorKind(trajectoryQuery.error) === "notFound"
                ? t("sessions.detail.notFound")
                : undefined
            }
            retrying={trajectoryQuery.isFetching}
            onRetry={() => void trajectoryQuery.refetch()}
          />
        ) : null}

        {trajectoryQuery.isLoading ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              {t("sessions.detail.loading")}
            </CardContent>
          </Card>
        ) : null}

        {trajectory ? (
          <SessionTrajectory
            className="h-[calc(100svh-18rem)] min-h-[28rem]"
            items={trajectory.items}
            selectedEventId={selectedEventId}
            onSelectEvent={(eventPk) => updateParam(eventSearchParam, eventPk)}
            focusedTurn={focusedTurn}
            onFocusTurn={(turnIndex) =>
              updateParam(turnSearchParam, turnIndex?.toString() ?? null)
            }
            formatTime={formatTime}
            formatNumber={formatNumber}
            labels={trajectoryLabels(t)}
            inspector={
              selectedEventId === null ? null : (
                <SessionEventInspector
                  key={selectedEventId}
                  detail={detail}
                  onClose={() => updateParam(eventSearchParam, null)}
                  attachmentUrl={usageAttachmentUrl}
                  formatDateTime={formatDateTime}
                  formatNumber={formatNumber}
                  labels={inspectorLabels(t)}
                />
              )
            }
          />
        ) : null}
      </div>
    </BaseLayout>
  );
}

function trajectoryLabels(t: ReturnType<typeof useI18n>["t"]): SessionTrajectoryLabels {
  return {
    context: t("sessions.trajectory.context"),
    user: t("sessions.trajectory.user"),
    assistant: t("sessions.trajectory.assistant"),
    toolCall: t("sessions.detail.toolCall"),
    toolResult: t("sessions.detail.toolResult"),
    compaction: t("sessions.trajectory.compaction"),
    compactionPrompt: t("sessions.trajectory.compactionPrompt"),
    compactionSummary: t("sessions.trajectory.compactionSummary"),
    input: t("sessions.trajectory.input"),
    output: t("sessions.trajectory.output"),
    noOutput: t("sessions.trajectory.noOutput"),
    showMore: t("sessions.trajectory.showMore"),
    showLess: t("sessions.trajectory.showLess"),
    openEvent: t("sessions.trajectory.openEvent"),
    turn: (index) => t("sessions.detail.turn", { index }),
    characters: (count) => t("sessions.event.characters", { count }),
    summary: (items, toolCalls) =>
      t("sessions.trajectory.summary", { items, toolCalls }),
    empty: t("sessions.trajectory.empty"),
    allTurns: t("sessions.trajectory.allTurns"),
    turnList: t("sessions.trajectory.turnList"),
    toolCount: (count) => t("sessions.trajectory.toolCount", { count }),
    toolsOnly: (names) => t("sessions.trajectory.toolsOnly", { names }),
    search: t("sessions.trajectory.search"),
    searchPosition: (current, total) =>
      t("sessions.trajectory.searchPosition", { current, total }),
    searchNoMatches: t("sessions.trajectory.searchNoMatches"),
    searchPrevious: t("sessions.trajectory.searchPrevious"),
    searchNext: t("sessions.trajectory.searchNext"),
    searchClear: t("sessions.trajectory.searchClear"),
    searchTurnMatches: (count) => t("sessions.trajectory.searchTurnMatches", { count }),
  };
}

function inspectorLabels(
  t: ReturnType<typeof useI18n>["t"],
): SessionEventInspectorLabels {
  return {
    title: t("sessions.event.title"),
    request: t("common.request"),
    response: t("common.response"),
    turn: (index) => t("sessions.detail.turn", { index }),
    close: t("sessions.event.close"),
    resize: t("sessions.event.resize"),
    loading: t("sessions.event.loading"),
    error: (message) => t("sessions.event.error", { message }),
    copy: t("sessions.event.copy"),
    noText: t("sessions.event.noText"),
    tabContent: t("sessions.event.tabContent"),
    tabTools: t("sessions.event.tabTools"),
    tabAttachments: t("sessions.event.tabAttachments"),
    tabMetadata: t("sessions.event.tabMetadata"),
    tabProperties: t("sessions.event.tabProperties"),
    noTools: t("sessions.event.noTools"),
    toolCall: t("sessions.detail.toolCall"),
    toolResult: t("sessions.detail.toolResult"),
    callId: t("sessions.detail.callId"),
    toolContentHidden: t("sessions.detail.toolContentHidden"),
    imageContentHidden: t("sessions.detail.imageContentHidden"),
    imageLabel: (index) => t("sessions.detail.imageLabel", { index }),
    openImage: (label) => t("sessions.detail.openImage", { label }),
  };
}

function SessionIdentity({ session }: { session: SessionInfo | undefined }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <div className="bg-ring/10 text-ring ring-ring/20 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1">
        <Bot className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h1
            className="truncate text-xl font-semibold tracking-tight"
            title={session?.title ?? undefined}
          >
            {session
              ? (session.title ?? agentDisplayName(session.agent_name))
              : t("sessions.detail.title")}
          </h1>
          {session?.agent_version && !session.title ? (
            <Badge variant="outline" className="font-mono text-[11px]">
              v{session.agent_version}
            </Badge>
          ) : null}
          <SessionPurposeBadge purpose={session?.purpose ?? null} />
        </div>
        {session ? (
          <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 font-mono text-xs">
            {session.title ? (
              <span className="shrink-0 font-sans">
                {agentDisplayName(session.agent_name)}
                {session.agent_version ? ` v${session.agent_version}` : ""} ·
              </span>
            ) : null}
            <span className="truncate">{session.session_id}</span>
            <CopyButton
              value={session.session_id}
              label={t("sessions.detail.copyId")}
            />
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
  session,
  turnCount,
  models,
}: {
  session: SessionInfo;
  turnCount: number | null;
  models: string[];
}) {
  const { t, formatDateTime, formatNumber } = useI18n();
  const modelSummary = React.useMemo(() => primaryModel(models), [models]);
  const stats = [
    {
      label: t("sessions.detail.startedAt"),
      value: formatDateTime(session.started_at),
    },
    {
      label: t("sessions.detail.duration"),
      value: session.ended_at
        ? formatDuration(session.started_at, session.ended_at, t)
        : t("sessions.detail.ongoing"),
    },
    {
      label: t("sessions.detail.turnCount"),
      value: turnCount === null ? "—" : formatNumber(turnCount),
    },
    {
      label: t("sessions.detail.model"),
      value: modelSummary
        ? modelSummary.others > 0
          ? `${modelSummary.name} +${modelSummary.others}`
          : modelSummary.name
        : "—",
      title: [...new Set(models)].join("\n"),
      mono: true,
    },
  ];
  return (
    <dl className="bg-card grid grid-cols-2 overflow-hidden rounded-xl border shadow-xs md:grid-cols-4">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={cn(
            "min-w-0 px-4 py-3",
            index % 2 === 1 && "border-l",
            index >= 2 && "max-md:border-t",
            index === 2 && "md:border-l",
          )}
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

/** The most frequent model, plus how many other models the session used. */
function primaryModel(models: string[]): { name: string; others: number } | null {
  const counts = new Map<string, number>();
  for (const model of models) {
    if (model) {
      counts.set(model, (counts.get(model) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  for (const [model, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) {
      best = model;
    }
  }
  return best === null ? null : { name: best, others: counts.size - 1 };
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

/** Every session field, verbatim, including collector-provided metadata. */
function SessionDetails({
  session,
  formatDateTime,
}: {
  session: SessionInfo;
  formatDateTime: (value: string) => string;
}) {
  const { t } = useI18n();
  const { metadata, ...fields } = session;
  const entries: [string, string][] = Object.entries(fields).map(([key, value]) => [
    key,
    value === null
      ? "—"
      : key === "started_at" || key === "ended_at"
        ? formatDateTime(String(value))
        : String(value),
  ]);
  if (metadata !== null && typeof metadata === "object") {
    for (const [key, value] of Object.entries(metadata)) {
      entries.push([
        `metadata.${key}`,
        typeof value === "string" ? value : JSON.stringify(value),
      ]);
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Info className="size-4" />
          {t("sessions.detail.details")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[28rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b px-4 py-2.5 text-sm font-medium">
          {t("sessions.detail.details")}
        </div>
        <dl className="grid max-h-80 grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 overflow-auto p-4 text-xs">
          {entries.map(([key, value]) => (
            <React.Fragment key={key}>
              <dt className="text-muted-foreground font-mono">{key}</dt>
              <dd className="font-mono break-all">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
