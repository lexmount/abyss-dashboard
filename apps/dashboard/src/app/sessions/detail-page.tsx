import { useQuery } from "@tanstack/react-query";
import { SessionTimeline, type SessionTimelineLabels } from "@lexmount/abyss-ui";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { fetchSessionTimeline, usageAttachmentUrl } from "@/api/usage";
import { BaseLayout } from "@/components/layouts/base-layout";
import { Button } from "@lexmount/abyss-ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lexmount/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";
import { agentDisplayName } from "@/lib/agents";

export default function SessionDetailPage() {
  const { t, formatDateTime, formatNumber } = useI18n();
  const { sessionPk } = useParams<{ sessionPk: string }>();
  const timelineQuery = useQuery({
    queryKey: ["session-timeline", sessionPk],
    queryFn: () => fetchSessionTimeline(sessionPk ?? ""),
    enabled: Boolean(sessionPk),
  });
  const timeline = timelineQuery.data;

  return (
    <BaseLayout
      title={t("sessions.detail.title")}
      description={
        timeline
          ? `${agentDisplayName(timeline.session.agent_name)} / ${timeline.session.session_id}`
          : t("sessions.detail.description")
      }
    >
      <div className="space-y-6 px-4 lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">
              <ArrowLeft className="size-4" />
              {t("sessions.back")}
            </Link>
          </Button>
        </div>

        {timelineQuery.isError ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>{t("sessions.detail.unavailable")}</CardTitle>
              <CardDescription>{timelineQuery.error.message}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {timelineQuery.isLoading ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              {t("sessions.detail.loading")}
            </CardContent>
          </Card>
        ) : null}

        {timeline ? (
          <SessionTimeline
            attachmentUrl={usageAttachmentUrl}
            formatAgentName={agentDisplayName}
            formatDateTime={formatDateTime}
            formatNumber={formatNumber}
            labels={timelineLabels(t)}
            timeline={timeline}
            showInternalIdentifiers
          />
        ) : null}
      </div>
    </BaseLayout>
  );
}

function timelineLabels(t: ReturnType<typeof useI18n>["t"]): SessionTimelineLabels {
  return {
    agent: t("common.agent"),
    callId: t("sessions.detail.callId"),
    deviceContext: t("sessions.detail.deviceContext"),
    ended: (time) => t("sessions.detail.ended", { time }),
    estimatedTokens: t("sessions.detail.estimatedTokens"),
    image: t("sessions.detail.image"),
    imageContentHidden: t("sessions.detail.imageContentHidden"),
    imageLabel: (index) => t("sessions.detail.imageLabel", { index }),
    noEvents: t("sessions.detail.noEvents"),
    noText: t("sessions.detail.noText"),
    noTurns: t("sessions.detail.noTurns"),
    openImage: (label) => t("sessions.detail.openImage", { label }),
    request: t("common.request"),
    response: t("common.response"),
    sessionPk: t("sessions.detail.sessionPk"),
    started: (time) => t("sessions.detail.started", { time }),
    timeline: t("sessions.detail.timeline"),
    tokens: t("common.tokens"),
    toolCall: t("sessions.detail.toolCall"),
    toolContentHidden: t("sessions.detail.toolContentHidden"),
    toolResult: t("sessions.detail.toolResult"),
    turn: (index) => t("sessions.detail.turn", { index }),
    turns: (count) => t("sessions.detail.turns", { count }),
    version: t("sessions.detail.version"),
  };
}
