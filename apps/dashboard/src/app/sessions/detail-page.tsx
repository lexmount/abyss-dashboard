import { useQuery } from "@tanstack/react-query";
import {
  SessionEventInspector,
  SessionTrajectory,
  type SessionEventDetailState,
  type SessionEventInspectorLabels,
  type SessionTrajectoryLabels,
} from "@lexmount.com/abyss-ui";
import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
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
        </div>

        {trajectoryQuery.isError ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>{t("sessions.detail.unavailable")}</CardTitle>
              <CardDescription>{trajectoryQuery.error.message}</CardDescription>
            </CardHeader>
          </Card>
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
            className="h-[calc(100svh-14rem)] min-h-[28rem]"
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
