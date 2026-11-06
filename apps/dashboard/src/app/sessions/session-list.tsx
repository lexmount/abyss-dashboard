import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SessionListResponse } from "@/api/usage";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lexmount.com/abyss-ui";
import { SessionPurposeBadge } from "@/components/session-purpose-badge";
import { useI18n } from "@/hooks/use-i18n";
import { agentDisplayName } from "@/lib/agents";
import { shortSessionId } from "@/lib/session-id";
import { entryLabelText } from "@/lib/entry-label";

interface SessionListProps {
  response: SessionListResponse | undefined;
  loading: boolean;
  onPageChange: (page: number) => void;
  /** Controls shown at the top right of the card, such as refresh. */
  action?: React.ReactNode;
}

/** Every observed session, most recently active first; a row opens its detail. */
export function SessionList({
  response,
  loading,
  onPageChange,
  action,
}: SessionListProps) {
  const { t, locale, formatNumber, formatDateTime } = useI18n();
  const navigate = useNavigate();
  const compactNumber = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumSignificantDigits: 3,
      }),
    [locale],
  );
  const items = response?.items ?? [];
  const pageCount = response
    ? Math.max(1, Math.ceil(response.total_sessions / response.page_size))
    : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sessions.list.title")}</CardTitle>
        <CardDescription>
          {response
            ? t("sessions.list.description", {
                count: formatNumber(response.total_sessions),
              })
            : t("sessions.list.loading")}
        </CardDescription>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>
        <Table className="w-full min-w-[900px] table-fixed">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[26%]" />
            <col className="w-[13%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[22%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>{t("sessions.list.lastActivity")}</TableHead>
              <TableHead>{t("common.session")}</TableHead>
              <TableHead>{t("common.agent")}</TableHead>
              <TableHead>{t("sessions.list.turns")}</TableHead>
              <TableHead>{t("sessions.list.events")}</TableHead>
              <TableHead>{t("common.tokens")}</TableHead>
              <TableHead>{t("sessions.list.host")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground h-24 text-center"
                >
                  {loading ? t("sessions.list.loading") : t("sessions.list.empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((session) => {
                const detailUrl = `/sessions/${session.session_pk}`;
                const title = entryLabelText(session.title);
                return (
                  <TableRow
                    key={session.session_pk}
                    className="cursor-pointer"
                    onClick={() => navigate(detailUrl)}
                  >
                    <TableCell className="overflow-hidden">
                      <span className="block truncate">
                        {formatDateTime(session.last_activity_at)}
                      </span>
                    </TableCell>
                    <TableCell className="overflow-hidden">
                      {title || session.purpose ? (
                        <div className="flex min-w-0 items-center gap-1.5">
                          {title ? (
                            <span className="truncate font-medium" title={title}>
                              {title}
                            </span>
                          ) : null}
                          <SessionPurposeBadge purpose={session.purpose} />
                        </div>
                      ) : null}
                      <Link
                        to={detailUrl}
                        title={session.session_id}
                        onClick={(event) => event.stopPropagation()}
                        className="text-foreground hover:text-ring inline-flex max-w-full items-center gap-1 font-mono text-xs underline-offset-4 hover:underline"
                      >
                        <span className="min-w-0 truncate">
                          {shortSessionId(session.session_id)}
                        </span>
                        <ExternalLink className="text-muted-foreground size-3 shrink-0" />
                      </Link>
                    </TableCell>
                    <TableCell className="overflow-hidden">
                      <div className="truncate font-medium">
                        {agentDisplayName(session.agent_name)}
                      </div>
                      {session.agent_version ? (
                        <div className="text-muted-foreground truncate text-xs">
                          {session.agent_version}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(session.turns)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(session.events)}
                    </TableCell>
                    <TableCell
                      className="tabular-nums"
                      title={formatNumber(session.total_tokens)}
                    >
                      {compactNumber.format(session.total_tokens)}
                    </TableCell>
                    <TableCell className="overflow-hidden">
                      <div className="truncate font-mono text-xs">
                        {session.host_name}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {session.platform}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
      {response && response.total_sessions > 0 ? (
        <div className="flex items-center justify-end gap-3 border-t px-6 pt-4 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {t("sessions.list.page", {
              page: formatNumber(response.page),
              pages: formatNumber(pageCount),
            })}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t("sessions.list.previous")}
            disabled={response.page <= 1 || loading}
            onClick={() => onPageChange(response.page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t("sessions.list.next")}
            disabled={!response.has_more || loading}
            onClick={() => onPageChange(response.page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
