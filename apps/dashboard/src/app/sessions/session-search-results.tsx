import * as React from "react";
import { ArrowRight, Clock, Monitor, Search } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  SearchFragment,
  SessionSearchResponse,
  SessionSearchResult,
} from "@/api/usage";
import { Badge } from "@lexmount.com/abyss-ui";
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
import { entryLabelText } from "@/lib/entry-label";

interface SessionSearchResultsProps {
  response: SessionSearchResponse;
  onPageChange: (page: number) => void;
  /** Controls shown beside the result count, such as refresh. */
  action?: React.ReactNode;
}

export function SessionSearchResults({
  response,
  onPageChange,
  action,
}: SessionSearchResultsProps) {
  const { t, formatNumber } = useI18n();
  if (response.items.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-12 text-center">
          <Search className="size-8" />
          <div className="font-medium">{t("sessions.search.emptyTitle")}</div>
          <div className="max-w-xl text-sm">
            {t("sessions.search.emptyDescription")}
          </div>
          {response.page > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onPageChange(response.page - 1)}
            >
              {t("pagination.previous")}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">{t("sessions.search.resultsTitle")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("sessions.search.resultCount", {
              count: formatNumber(response.total_sessions),
            })}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-muted-foreground text-sm">
            {t("sessions.search.page", { page: formatNumber(response.page) })}
          </div>
          {action}
        </div>
      </div>

      {response.items.map((result) => (
        <SessionResultCard
          key={result.session_pk}
          result={result}
          query={response.query}
        />
      ))}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={response.page <= 1}
          onClick={() => onPageChange(response.page - 1)}
        >
          {t("pagination.previous")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!response.has_more}
          onClick={() => onPageChange(response.page + 1)}
        >
          {t("pagination.next")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Opens a session with the search carried over, at a hit's event when
 * given: the session shows that event's segment and starts the search at the
 * event's first hit, without opening the event.
 */
export function sessionSearchLink(
  sessionPk: string,
  query: string,
  eventPk?: string,
): string {
  const params = new URLSearchParams();
  if (eventPk !== undefined) {
    params.set("event", eventPk);
  }
  params.set("q", query);
  return `/sessions/${encodeURIComponent(sessionPk)}?${params}`;
}

const linkFocus =
  "focus-visible:ring-ring/50 block focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

function SessionResultCard({
  result,
  query,
}: {
  result: SessionSearchResult;
  query: string;
}) {
  const { t, formatDateTime, formatNumber } = useI18n();
  const title = entryLabelText(result.title) ?? result.session_id;
  return (
    <Card className="transition-colors hover:border-primary/40">
      {/* The header opens the session; each hit opens it at the hit's event. */}
      <Link
        to={sessionSearchLink(result.session_pk, query)}
        className={`${linkFocus} rounded-t-xl`}
      >
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="truncate text-base" title={title}>
                {agentDisplayName(result.agent_name)}
                <span className="text-muted-foreground font-normal"> / </span>
                <span className={result.title ? "font-medium" : "font-mono text-sm"}>
                  {title}
                </span>
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {formatDateTime(result.started_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Monitor className="size-3.5" />
                  {result.platform} / {result.host_name}
                </span>
              </CardDescription>
            </div>
            <span className="bg-primary text-primary-foreground inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium">
              {t("sessions.search.openSession")}
              <ArrowRight className="size-4" />
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {result.models.map((model) => (
              <Badge key={model} variant="secondary">
                {model}
              </Badge>
            ))}
            {result.providers.map((provider) => (
              <Badge key={provider} variant="outline">
                {provider}
              </Badge>
            ))}
            <Badge variant="outline">
              {t("sessions.search.matches", {
                count: formatNumber(result.match_count),
                new: formatNumber(result.new_match_count),
              })}
            </Badge>
          </div>
        </CardHeader>
      </Link>
      <CardContent className="space-y-3">
        {result.matches.map((match) => (
          <Link
            key={match.event_pk}
            to={sessionSearchLink(result.session_pk, query, match.event_pk)}
            className={`${linkFocus} bg-muted/20 hover:bg-muted/40 rounded-lg border p-3 transition-colors`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={match.event_type === "request" ? "default" : "secondary"}>
                {match.event_type === "request"
                  ? t("common.request")
                  : t("common.response")}
              </Badge>
              {/* Every hit of the event is in the context it carried over. */}
              {match.new ? null : (
                <Badge variant="outline">{t("sessions.search.context")}</Badge>
              )}
              <span className="text-sm font-medium">
                {match.location
                  ? t("sessions.event.segmentNumber", {
                      number: formatNumber(match.location.segment_index),
                    })
                  : t("sessions.event.locate")}
              </span>
              <span className="text-muted-foreground text-xs">
                {formatDateTime(match.observed_at)}
              </span>
            </div>
            {match.fragments.length > 0 ? (
              <div className="space-y-2 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                {match.fragments.map((fragment, index) => (
                  <HighlightedFragment
                    key={`${match.event_pk}-${index}`}
                    fragment={fragment}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("sessions.search.noPreview")}
              </p>
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function HighlightedFragment({ fragment }: { fragment: SearchFragment }) {
  return (
    <p>
      {fragment.segments.map((segment, index) =>
        segment.highlighted ? (
          <mark
            key={index}
            className="bg-primary/15 text-foreground rounded-sm px-0.5 font-semibold"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
