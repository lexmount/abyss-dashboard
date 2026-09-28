import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  neighborEventIds,
  SessionLedger,
  SessionTrajectory,
  ToggleGroup,
  ToggleGroupItem,
  type SessionLedgerDetailState,
  type SessionLedgerLabels,
  type SessionTrajectoryLabels,
} from "@lexmount.com/abyss-ui";
import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchSessionOutline,
  fetchSessionTrajectory,
  fetchUsageEvent,
  usageAttachmentUrl,
  type SessionInfo,
} from "@/api/usage";
import { BaseLayout } from "@/components/layouts/base-layout";
import { Button } from "@lexmount.com/abyss-ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lexmount.com/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";
import { agentDisplayName } from "@/lib/agents";

const eventSearchParam = "event";
const viewSearchParam = "view";
const eventsView = "events";

function usageEventQuery(eventPk: string) {
  return {
    queryKey: ["usage-event", eventPk],
    queryFn: () => fetchUsageEvent(eventPk),
    // Persisted events never change, so a loaded event stays valid.
    staleTime: Infinity,
  };
}

export default function SessionDetailPage() {
  const { t, locale, formatDateTime, formatNumber } = useI18n();
  const { sessionPk } = useParams<{ sessionPk: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedEventId = searchParams.get(eventSearchParam);
  const showEvents = searchParams.get(viewSearchParam) === eventsView;
  const queryClient = useQueryClient();

  const trajectoryQuery = useQuery({
    queryKey: ["session-trajectory", sessionPk],
    queryFn: () => fetchSessionTrajectory(sessionPk ?? ""),
    enabled: Boolean(sessionPk) && !showEvents,
  });
  const outlineQuery = useQuery({
    queryKey: ["session-outline", sessionPk],
    queryFn: () => fetchSessionOutline(sessionPk ?? ""),
    enabled: Boolean(sessionPk) && showEvents,
  });
  const outline = outlineQuery.data;
  const trajectory = trajectoryQuery.data;
  const session = outline?.session ?? trajectory?.session;
  const activeQuery = showEvents ? outlineQuery : trajectoryQuery;
  const eventQuery = useQuery({
    ...usageEventQuery(selectedEventId ?? ""),
    enabled: selectedEventId !== null,
  });

  // Prefetch adjacent events so stepping through the ledger stays instant.
  React.useEffect(() => {
    if (!outline || selectedEventId === null) {
      return;
    }
    for (const eventPk of neighborEventIds(outline.turns, selectedEventId)) {
      void queryClient.prefetchQuery(usageEventQuery(eventPk));
    }
  }, [outline, queryClient, selectedEventId]);

  const selectEvent = React.useCallback(
    (eventPk: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (eventPk === null) {
            next.delete(eventSearchParam);
          } else {
            next.set(eventSearchParam, eventPk);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const showView = React.useCallback(
    (events: boolean, eventPk?: string) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (events) {
          next.set(viewSearchParam, eventsView);
        } else {
          next.delete(viewSearchParam);
        }
        if (eventPk !== undefined) {
          next.set(eventSearchParam, eventPk);
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const formatTime = React.useCallback(
    (value: string) =>
      new Intl.DateTimeFormat(locale, { timeStyle: "medium" }).format(new Date(value)),
    [locale],
  );

  const detail: SessionLedgerDetailState = eventQuery.isError
    ? { status: "error", message: eventQuery.error.message }
    : eventQuery.data
      ? { status: "ready", event: eventQuery.data }
      : { status: "loading" };

  return (
    <BaseLayout
      title={
        session
          ? [agentDisplayName(session.agent_name), session.agent_version]
              .filter(Boolean)
              .join(" ")
          : t("sessions.detail.title")
      }
      description={session ? session.session_id : t("sessions.detail.description")}
    >
      <div className="space-y-4 px-4 lg:px-6">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">
              <ArrowLeft className="size-4" />
              {t("sessions.back")}
            </Link>
          </Button>
          {session ? (
            <SessionProperties session={session} formatDateTime={formatDateTime} />
          ) : null}
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={showEvents ? eventsView : "merged"}
            onValueChange={(value) => {
              if (value) {
                showView(value === eventsView);
              }
            }}
          >
            <ToggleGroupItem value="merged" className="px-3">
              {t("sessions.trajectory.view")}
            </ToggleGroupItem>
            <ToggleGroupItem value={eventsView} className="px-3">
              {t("sessions.ledger.view")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {activeQuery.isError ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>{t("sessions.detail.unavailable")}</CardTitle>
              <CardDescription>{activeQuery.error.message}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {activeQuery.isLoading ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              {t("sessions.detail.loading")}
            </CardContent>
          </Card>
        ) : null}

        {!showEvents && trajectory ? (
          <SessionTrajectory
            className="h-[calc(100svh-14rem)] min-h-[28rem]"
            items={trajectory.items}
            onOpenEvent={(eventPk) => showView(true, eventPk)}
            formatTime={formatTime}
            formatNumber={formatNumber}
            labels={trajectoryLabels(t)}
          />
        ) : null}

        {showEvents && outline ? (
          <SessionLedger
            className="h-[calc(100svh-14rem)] min-h-[28rem]"
            outline={outline}
            selectedEventId={selectedEventId}
            onSelectEvent={selectEvent}
            detail={detail}
            attachmentUrl={usageAttachmentUrl}
            formatDateTime={formatDateTime}
            formatTime={formatTime}
            formatNumber={formatNumber}
            labels={ledgerLabels(t)}
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
    input: t("sessions.trajectory.input"),
    output: t("sessions.trajectory.output"),
    noOutput: t("sessions.trajectory.noOutput"),
    showMore: t("sessions.trajectory.showMore"),
    showLess: t("sessions.trajectory.showLess"),
    openEvent: t("sessions.trajectory.openEvent"),
    turn: (index) => t("sessions.detail.turn", { index }),
    characters: (count) => t("sessions.ledger.characters", { count }),
    mainStream: t("sessions.trajectory.mainStream"),
    allStreams: t("sessions.trajectory.allStreams"),
    streamLabel: (stream) => t("sessions.trajectory.stream", { stream }),
    summary: (items, toolCalls) =>
      t("sessions.trajectory.summary", { items, toolCalls }),
    empty: t("sessions.trajectory.empty"),
  };
}

function ledgerLabels(t: ReturnType<typeof useI18n>["t"]): SessionLedgerLabels {
  return {
    all: t("sessions.ledger.all"),
    request: t("common.request"),
    response: t("common.response"),
    requestNumber: (number) => t("sessions.ledger.requestNumber", { number }),
    turn: (index) => t("sessions.detail.turn", { index }),
    turnSummary: (events, input, output) =>
      t("sessions.ledger.turnSummary", { events, input, output }),
    sessionSummary: (turns, events, requests) =>
      t("sessions.ledger.sessionSummary", { turns, events, requests }),
    collapseAll: t("sessions.ledger.collapseAll"),
    expandAll: t("sessions.ledger.expandAll"),
    filter: t("sessions.ledger.filter"),
    noText: t("sessions.ledger.noText"),
    noTurns: t("sessions.detail.noTurns"),
    characters: (count) => t("sessions.ledger.characters", { count }),
    tokens: (count) => t("sessions.ledger.tokens", { count }),
    estimatedTokens: t("sessions.detail.estimatedTokens"),
    close: t("sessions.ledger.close"),
    resize: t("sessions.ledger.resize"),
    loading: t("sessions.ledger.loading"),
    error: (message) => t("sessions.ledger.error", { message }),
    copy: t("sessions.ledger.copy"),
    tabContent: t("sessions.ledger.tabContent"),
    tabTools: t("sessions.ledger.tabTools"),
    tabAttachments: t("sessions.ledger.tabAttachments"),
    tabMetadata: t("sessions.ledger.tabMetadata"),
    tabProperties: t("sessions.ledger.tabProperties"),
    noTools: t("sessions.ledger.noTools"),
    toolCall: t("sessions.detail.toolCall"),
    toolResult: t("sessions.detail.toolResult"),
    callId: t("sessions.detail.callId"),
    toolContentHidden: t("sessions.detail.toolContentHidden"),
    imageContentHidden: t("sessions.detail.imageContentHidden"),
    imageLabel: (index) => t("sessions.detail.imageLabel", { index }),
    openImage: (label) => t("sessions.detail.openImage", { label }),
  };
}

/** Every session field, verbatim, including collector-provided metadata. */
function SessionProperties({
  session,
  formatDateTime,
}: {
  session: SessionInfo;
  formatDateTime: (value: string) => string;
}) {
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
    <dl className="text-muted-foreground flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex min-w-0 gap-1.5">
          <dt className="font-mono">{key}</dt>
          <dd className="text-foreground truncate font-mono">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
