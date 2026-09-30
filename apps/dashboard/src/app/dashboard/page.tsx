"use client";

import * as React from "react";
import {
  keepPreviousData,
  type Query,
  useIsFetching,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Database,
  ExternalLink,
  MessageSquare,
  RotateCcw,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  fetchDailyTokenUsage,
  fetchRawEvents,
  fetchUsageSummary,
  type DailyTokenUsageRow,
  type SummaryRow,
  type UsageEvent,
  type UsageQuery,
} from "@/api/usage";
import { BaseLayout } from "@/components/layouts/base-layout";
import { Badge } from "@lexmount.com/abyss-ui";
import { Button } from "@lexmount.com/abyss-ui";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lexmount.com/abyss-ui";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@lexmount.com/abyss-ui";
import { Label } from "@lexmount.com/abyss-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lexmount.com/abyss-ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lexmount.com/abyss-ui";
import { ToggleGroup, ToggleGroupItem } from "@lexmount.com/abyss-ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lexmount.com/abyss-ui";
import { QueryErrorBanner } from "@/components/query-error";
import { RefreshControl } from "@/components/refresh-control";
import { SessionPicker } from "@/components/session-picker";
import { TimeRangeField } from "@/components/time-range-field";
import { useI18n } from "@/hooks/use-i18n";
import { shortSessionId } from "@/lib/session-id";
import { modelChoices, providerChoices } from "@/lib/usage-choices";
import { createTimeRange, resolveTimeRange, type TimeRange } from "@/lib/time-range";
import { agentDisplayName, agentFilterOptions, agentProductKey } from "@/lib/agents";

interface FilterDraft {
  time: TimeRange;
  agentName: string;
  sessionId: string;
  provider: string;
  model: string;
  eventType: string;
}

const defaultNonDateFilters = {
  agentName: "",
  sessionId: "",
  provider: "",
  model: "",
  eventType: "all",
} satisfies Omit<FilterDraft, "time">;

const pageSizeOptions = [10, 20, 50] as const;
const tokenChartRangeOptions = [
  { value: "7d", days: 7, labelKey: "dashboard.tokenChart.range7Days" },
  { value: "30d", days: 30, labelKey: "dashboard.tokenChart.range30Days" },
  { value: "90d", days: 90, labelKey: "dashboard.tokenChart.range90Days" },
] as const;
export type TokenChartRange = (typeof tokenChartRangeOptions)[number]["value"];

export default function DashboardPage() {
  return <UsageDashboard />;
}

export function UsageDashboard() {
  const { t } = useI18n();
  const [draft, setDraft] = React.useState<FilterDraft>(() => createDefaultFilters());
  const [filters, setFilters] = React.useState<FilterDraft>(() =>
    createDefaultFilters(),
  );
  const [tokenChartRange, setTokenChartRange] = React.useState<TokenChartRange>("7d");
  // Relative ranges end at this moment; applying filters or refreshing moves it.
  const [now, setNow] = React.useState(() => new Date());
  const queryClient = useQueryClient();
  const query = React.useMemo<UsageQuery>(
    () => ({
      ...resolveTimeRange(filters.time, now),
      agentName: filters.agentName,
      sessionId: filters.sessionId,
      provider: filters.provider,
      model: filters.model,
      eventType: filters.eventType === "all" ? "" : filters.eventType,
    }),
    [filters, now],
  );
  const tokenChartWindow = React.useMemo(
    () => tokenChartDateWindow(tokenChartRange, now),
    [tokenChartRange, now],
  );
  const chartQuery = React.useMemo<UsageQuery>(
    () => ({
      ...query,
      from: tokenChartWindow.from,
      to: tokenChartWindow.to,
    }),
    [query, tokenChartWindow],
  );

  const summaryQuery = useQuery({
    queryKey: ["usage-summary", "table", query],
    queryFn: () => fetchUsageSummary(query),
  });
  const chartSummaryQuery = useQuery({
    queryKey: ["usage-summary", "token-chart", chartQuery],
    queryFn: () => fetchDailyTokenUsage(chartQuery),
  });
  // Recent events page through the backend, so every matching event is
  // reachable rather than only the newest hundred.
  const [eventsPage, setEventsPage] = React.useState(0);
  const [eventsPageSize, setEventsPageSize] = React.useState<number>(
    pageSizeOptions[0],
  );
  React.useEffect(() => {
    setEventsPage(0);
  }, [query]);
  const eventsQuery = useQuery({
    queryKey: ["usage-events", query, eventsPage, eventsPageSize],
    queryFn: () =>
      fetchRawEvents(query, {
        limit: eventsPageSize,
        offset: eventsPage * eventsPageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = React.useMemo(
    () => summaryQuery.data?.rows ?? [],
    [summaryQuery.data?.rows],
  );
  const chartSummaryRows = React.useMemo(
    () => chartSummaryQuery.data?.rows ?? [],
    [chartSummaryQuery.data?.rows],
  );
  const events = React.useMemo(
    () => eventsQuery.data?.events ?? [],
    [eventsQuery.data?.events],
  );
  const totals = React.useMemo(() => summarizeRows(rows), [rows]);
  const agentCount = React.useMemo(() => countAgentProducts(rows), [rows]);
  const chartRows = React.useMemo(
    () => chartRowsByDay(chartSummaryRows, tokenChartWindow),
    [chartSummaryRows, tokenChartWindow],
  );

  const refreshing = useIsFetching({ predicate: isUsageQuery }) > 0;
  const usageError = summaryQuery.error ?? chartSummaryQuery.error ?? eventsQuery.error;
  const updatedAt = Math.max(
    summaryQuery.dataUpdatedAt,
    chartSummaryQuery.dataUpdatedAt,
    eventsQuery.dataUpdatedAt,
  );

  return (
    <BaseLayout title={t("dashboard.title")} description={t("dashboard.description")}>
      <div className="@container/main space-y-6 px-4 lg:px-6">
        <UsageFilters
          draft={draft}
          onDraftChange={setDraft}
          onApply={() => {
            setNow(new Date());
            setFilters(draft);
          }}
          onReset={() => {
            const nextFilters = createDefaultFilters();
            setNow(new Date());
            setDraft(nextFilters);
            setFilters(nextFilters);
          }}
        />

        {/* One explanation for the page; failed sections below only say
            they have nothing to show, rather than repeating the error. */}
        {usageError ? (
          <QueryErrorBanner
            error={usageError}
            retrying={refreshing}
            onRetry={() => {
              void queryClient.invalidateQueries({ predicate: isUsageQuery });
            }}
          />
        ) : null}
        <MetricCards
          totals={totals}
          agentCount={agentCount}
          loading={summaryQuery.isLoading}
          unavailable={summaryQuery.isError}
        />

        <TokenChart
          rows={chartRows}
          loading={chartSummaryQuery.isLoading}
          unavailable={chartSummaryQuery.isError}
          range={tokenChartRange}
          onRangeChange={setTokenChartRange}
        />

        <RawEventsTable
          events={events}
          loading={eventsQuery.isLoading}
          error={eventsQuery.error}
          pagination={{
            pageIndex: eventsPage,
            pageSize: eventsPageSize,
            // Every event is a request or a response in the same filter scope.
            total: summaryQuery.data ? totals.requests + totals.responses : undefined,
            hasNext: eventsQuery.data?.next_page_token != null,
            onPageChange: setEventsPage,
            onPageSizeChange: (pageSize) => {
              setEventsPageSize(pageSize);
              setEventsPage(0);
            },
          }}
          action={
            <RefreshControl
              refreshing={refreshing}
              updatedAt={updatedAt}
              onRefresh={() => {
                setNow(new Date());
                void queryClient.invalidateQueries({ predicate: isUsageQuery });
              }}
            />
          }
        />
      </div>
    </BaseLayout>
  );
}

const usageQueryRoots = new Set([
  "usage-summary",
  "usage-events",
  "usage-models",
  "session-options",
]);

function isUsageQuery(query: Query): boolean {
  return usageQueryRoots.has(String(query.queryKey[0]));
}

interface UsageFiltersProps {
  draft: FilterDraft;
  onDraftChange: (draft: FilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
}

function UsageFilters({ draft, onDraftChange, onApply, onReset }: UsageFiltersProps) {
  const { t } = useI18n();
  const update = <Field extends keyof FilterDraft>(
    field: Field,
    value: FilterDraft[Field],
  ): void => {
    onDraftChange({ ...draft, [field]: value });
  };
  const sessionScope = React.useMemo(
    () => ({ ...resolveTimeRange(draft.time), agentName: draft.agentName }),
    [draft.time, draft.agentName],
  );
  // Session choices also follow the provider and model, so only sessions that
  // used them are offered.
  const pickerScope = React.useMemo(
    () => ({ ...sessionScope, provider: draft.provider, model: draft.model }),
    [sessionScope, draft.provider, draft.model],
  );
  // Provider and model choices come from the data in the time and Agent
  // scope, so custom gateways are listed; picking a provider narrows the
  // models to the ones it served. Neither choice hides its own alternatives.
  const choicesQuery = useQuery({
    queryKey: ["usage-models", "dashboard-filters", sessionScope],
    queryFn: () => fetchUsageSummary(sessionScope, { groupBy: ["provider", "model"] }),
    staleTime: 60_000,
  });
  const choiceRows = React.useMemo(
    () => choicesQuery.data?.rows ?? [],
    [choicesQuery.data?.rows],
  );
  const providerOptions = React.useMemo(
    () => providerChoices(choiceRows, draft.provider),
    [choiceRows, draft.provider],
  );
  const modelOptions = React.useMemo(
    () =>
      modelChoices(
        draft.provider
          ? choiceRows.filter((row) => row.llm_provider === draft.provider)
          : choiceRows,
        draft.model,
      ),
    [choiceRows, draft.provider, draft.model],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.filters.title")}</CardTitle>
        <CardDescription>{t("dashboard.filters.description")}</CardDescription>
        <CardAction className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="size-4" />
            {t("common.reset")}
          </Button>
          <Button size="sm" onClick={onApply}>
            <Search className="size-4" />
            {t("common.apply")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent
        className="dashboard-filter-grid grid gap-4"
        data-testid="usage-filters-grid"
        data-time-range={draft.time.preset}
      >
        <TimeRangeField value={draft.time} onChange={(time) => update("time", time)} />
        <Field label={t("common.agent")}>
          <Select
            value={draft.agentName || "all"}
            onValueChange={(value) => update("agentName", value === "all" ? "" : value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {agentFilterOptions.map((agent) => (
                <SelectItem key={agent.value} value={agent.value}>
                  {agent.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("common.provider")}>
          <Select
            value={draft.provider || "all"}
            onValueChange={(value) => update("provider", value === "all" ? "" : value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {providerOptions.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("common.model")}>
          <Select
            value={draft.model || "all"}
            onValueChange={(value) => update("model", value === "all" ? "" : value)}
          >
            <SelectTrigger className="w-full" title={draft.model || undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {modelOptions.map((model) => (
                <SelectItem key={model} value={model} className="font-mono text-xs">
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("common.session")}>
          <SessionPicker
            value={draft.sessionId}
            scope={pickerScope}
            onChange={(sessionId) => update("sessionId", sessionId)}
          />
        </Field>
        <Field label={t("common.event")}>
          <Select
            value={draft.eventType}
            onValueChange={(value) => update("eventType", value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="request">{t("common.request")}</SelectItem>
              <SelectItem value="response">{t("common.response")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// Legend rows: input / output, then cache read / cache write, so cache reads
// sit under input and cache writes under output.
const usageShares = [
  { key: "input", dataKey: "input_tokens", color: "var(--usage-input)" },
  { key: "output", dataKey: "output_tokens", color: "var(--usage-output)" },
  { key: "cacheRead", dataKey: "cache_read_tokens", color: "var(--usage-cache-read)" },
  {
    key: "cacheWrite",
    dataKey: "cache_write_tokens",
    color: "var(--usage-cache-write)",
  },
] as const;

type UsageShareKey = (typeof usageShares)[number]["key"];

/** Bar order follows the legend, reading input, output, cache read, cache write. */
const tooltipOrder = [
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
];

const usageBarOrder: UsageShareKey[] = ["input", "output", "cacheRead", "cacheWrite"];

function formatShare(value: number, total: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(total > 0 ? value / total : 0);
}

/**
 * Token composition for the total card: a proportional bar whose colors match
 * the daily chart, and a legend with input / output above cache read / cache
 * write. Hovering a segment or entry shows its exact count and share.
 */
function TokenBreakdown({ totals }: { totals: UsageTotals }) {
  const { t, locale, formatNumber } = useI18n();
  const compactNumber = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumSignificantDigits: 3,
      }),
    [locale],
  );
  const values: Record<UsageShareKey, number> = {
    input: totals.inputTokens,
    output: totals.outputTokens,
    cacheWrite: totals.cacheWriteTokens,
    cacheRead: totals.cacheReadTokens,
  };
  const labels: Record<UsageShareKey, string> = {
    input: t("dashboard.metric.input"),
    output: t("dashboard.metric.output"),
    cacheWrite: t("dashboard.metric.cacheWrite"),
    cacheRead: t("dashboard.metric.cacheRead"),
  };
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  const shareText = (key: UsageShareKey): string =>
    t("dashboard.metric.share", {
      label: labels[key],
      value: formatNumber(values[key]),
      percent: formatShare(values[key], total, locale),
    });
  const colorOf = (key: UsageShareKey): string =>
    usageShares.find((share) => share.key === key)?.color ?? "";

  return (
    <div className="grid gap-2.5">
      <div className="bg-muted flex h-1.5 gap-0.5 rounded-full">
        {total > 0
          ? usageBarOrder
              .filter((key) => values[key] > 0)
              .map((key) => (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <span
                      aria-label={shareText(key)}
                      className="relative min-w-0.5 first:rounded-l-full last:rounded-r-full before:absolute before:-inset-y-1.5 before:inset-x-0"
                      style={{ flexGrow: values[key], background: colorOf(key) }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{shareText(key)}</TooltipContent>
                </Tooltip>
              ))
          : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {usageShares.map(({ key, color }) => (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <div className="flex min-w-0 cursor-default items-center gap-1.5">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <dt className="truncate">{labels[key]}</dt>
                <dd className="text-foreground ml-auto font-medium tabular-nums">
                  {compactNumber.format(values[key])}
                </dd>
              </div>
            </TooltipTrigger>
            <TooltipContent>{shareText(key)}</TooltipContent>
          </Tooltip>
        ))}
      </dl>
    </div>
  );
}

function TokenTooltipRow({
  label,
  color,
  value,
  total,
}: {
  label: React.ReactNode;
  color: string | undefined;
  value: number;
  total: number;
}) {
  const { locale, formatNumber } = useI18n();
  return (
    <div className="flex w-full items-center gap-2">
      <span
        className="size-2.5 shrink-0 rounded-[2px]"
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground ml-auto font-mono font-medium tabular-nums">
        {formatNumber(value)}
      </span>
      <span className="text-muted-foreground w-11 text-right tabular-nums">
        {formatShare(value, total, locale)}
      </span>
    </div>
  );
}

function MetricCards({
  totals,
  agentCount,
  loading,
  unavailable,
}: {
  totals: UsageTotals;
  agentCount: number;
  loading: boolean;
  /** The summary failed, so there are no numbers to show. */
  unavailable: boolean;
}) {
  const { t, formatNumber } = useI18n();
  const cards = [
    {
      label: t("dashboard.metric.totalTokens"),
      value: totals.totalTokens,
      icon: Database,
      detail: <TokenBreakdown totals={totals} />,
    },
    {
      label: t("dashboard.metric.sessions"),
      value: totals.sessions,
      icon: Activity,
      detail: t("dashboard.metric.turnsObserved", {
        count: formatNumber(totals.turns),
      }),
    },
    {
      label: t("dashboard.metric.requests"),
      value: totals.requests,
      icon: MessageSquare,
      detail: t("dashboard.metric.responses", {
        count: formatNumber(totals.responses),
      }),
    },
    {
      label: t("dashboard.metric.agents"),
      value: agentCount,
      icon: Bot,
      detail: t("dashboard.metric.uniqueAgents"),
    },
  ];

  return (
    <div className="*:data-[slot=card]:from-ring/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="@container/card">
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[300px]/card:text-3xl">
              {unavailable ? "—" : loading ? "..." : formatNumber(card.value)}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <card.icon className="size-3.5" />
                {t("common.live")}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {unavailable ? t("dashboard.sectionUnavailable") : card.detail}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TokenChart({
  rows,
  loading,
  unavailable,
  range,
  onRangeChange,
}: {
  rows: ChartRow[];
  loading: boolean;
  unavailable: boolean;
  range: TokenChartRange;
  onRangeChange: (range: TokenChartRange) => void;
}) {
  const { t, locale } = useI18n();
  // Daily totals reach the billions once cached input is counted.
  const compactNumber = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
    [locale],
  );
  const hasUsage = React.useMemo(
    () => rows.some((row) => row.total_tokens > 0),
    [rows],
  );
  const chartConfig = React.useMemo(
    () =>
      ({
        cache_read_tokens: {
          label: t("dashboard.tokenChart.cacheReadTokens"),
          color: "var(--usage-cache-read)",
        },
        cache_write_tokens: {
          label: t("dashboard.tokenChart.cacheWriteTokens"),
          color: "var(--usage-cache-write)",
        },
        input_tokens: {
          label: t("dashboard.tokenChart.inputTokens"),
          color: "var(--usage-input)",
        },
        output_tokens: {
          label: t("dashboard.tokenChart.outputTokens"),
          color: "var(--usage-output)",
        },
      }) satisfies ChartConfig,
    [t],
  );

  return (
    <Card className="@container/card">
      <CardHeader className="gap-3">
        <CardTitle>{t("dashboard.tokenChart.title")}</CardTitle>
        <CardDescription>{t("dashboard.tokenChart.description")}</CardDescription>
        <CardAction className="row-start-3 col-start-1 mt-2 justify-self-start @lg/card-header:row-span-2 @lg/card-header:row-start-1 @lg/card-header:col-start-2 @lg/card-header:mt-0 @lg/card-header:justify-self-end">
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(value) => {
              if (isTokenChartRange(value)) {
                onRangeChange(value);
              }
            }}
            variant="outline"
            size="sm"
            aria-label={t("dashboard.tokenChart.rangeLabel")}
            className="grid w-full grid-cols-3 sm:w-auto"
          >
            {tokenChartRangeOptions.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="min-w-16 px-3 text-xs"
              >
                {t(option.labelKey)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {unavailable ? (
          <div className="text-muted-foreground flex h-[250px] items-center justify-center text-sm">
            {t("dashboard.sectionUnavailable")}
          </div>
        ) : loading ? (
          <div className="text-muted-foreground flex h-[250px] items-center justify-center text-sm">
            {t("dashboard.tokenChart.loading")}
          </div>
        ) : !hasUsage ? (
          <div className="text-muted-foreground flex h-[250px] items-center justify-center text-sm">
            {t("dashboard.tokenChart.empty")}
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
            <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="fillCachedInputTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-cache_read_tokens)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-cache_read_tokens)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tickMargin={8}
                allowDecimals={false}
                domain={[0, "auto"]}
                tickFormatter={(value) => compactNumber.format(Number(value))}
              />
              <ChartTooltip
                cursor={false}
                content={({ active, payload, label }) => (
                  <ChartTooltipContent
                    active={active}
                    label={label}
                    // List series in the legend's order rather than stack order.
                    payload={[...(payload ?? [])].sort(
                      (left, right) =>
                        tooltipOrder.indexOf(String(left.dataKey)) -
                        tooltipOrder.indexOf(String(right.dataKey)),
                    )}
                    className="min-w-[13rem]"
                    formatter={(value, name, item) => (
                      <TokenTooltipRow
                        label={chartConfig[name as keyof typeof chartConfig]?.label}
                        color={item.color}
                        value={Number(value)}
                        total={Number(
                          (item.payload as ChartRow | undefined)?.total_tokens ?? 0,
                        )}
                      />
                    )}
                  />
                )}
              />
              {/* Disjoint series stack to the daily total. */}
              <Area
                dataKey="output_tokens"
                type="monotone"
                fill="var(--color-output_tokens)"
                fillOpacity={0.3}
                stroke="var(--color-output_tokens)"
                stackId="tokens"
              />
              <Area
                dataKey="input_tokens"
                type="monotone"
                fill="var(--color-input_tokens)"
                fillOpacity={0.3}
                stroke="var(--color-input_tokens)"
                stackId="tokens"
              />
              <Area
                dataKey="cache_write_tokens"
                type="monotone"
                fill="var(--color-cache_write_tokens)"
                fillOpacity={0.3}
                stroke="var(--color-cache_write_tokens)"
                stackId="tokens"
              />
              <Area
                dataKey="cache_read_tokens"
                type="monotone"
                fill="url(#fillCachedInputTokens)"
                stroke="var(--color-cache_read_tokens)"
                stackId="tokens"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Page state for a table whose rows are paged by the backend. */
export interface ServerPagination {
  pageIndex: number;
  pageSize: number;
  /** Matching rows across all pages, when known. */
  total: number | undefined;
  hasNext: boolean;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function RawEventsTable({
  events,
  loading,
  error,
  action,
  pagination: serverPagination,
}: {
  events: UsageEvent[];
  loading: boolean;
  error: Error | null;
  /** Controls shown at the top right of the card, such as refresh. */
  action?: React.ReactNode;
  /** Backend paging; without it the given events are paged locally. */
  pagination?: ServerPagination;
}) {
  const { t, locale, formatNumber, formatDateTime } = useI18n();
  const localPagination = useTablePagination(events);
  const pagination = serverPagination
    ? serverTablePagination(events, serverPagination)
    : localPagination;
  const compactNumber = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumSignificantDigits: 3,
      }),
    [locale],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.recent.title")}</CardTitle>
        <CardDescription>{t("dashboard.recent.description")}</CardDescription>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-muted-foreground py-10 text-center text-sm">
            {t("dashboard.sectionUnavailable")}
          </div>
        ) : loading ? (
          <div className="text-muted-foreground py-10 text-center text-sm">
            {t("dashboard.recent.loading")}
          </div>
        ) : (
          <Table className="w-full min-w-[1100px] table-fixed">
            {/* When, then the session and its turn together, then model and
                agent; token count, event type, and device context last. */}
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[8%]" />
              <col className="w-[20%]" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.observed")}</TableHead>
                <TableHead>{t("common.session")}</TableHead>
                <TableHead>{t("dashboard.recent.turn")}</TableHead>
                <TableHead>{t("common.model")}</TableHead>
                <TableHead>{t("common.agent")}</TableHead>
                <TableHead className="leading-tight">
                  <div>{t("common.tokens")}</div>
                  <div className="text-muted-foreground text-xs font-normal">
                    {t("dashboard.recent.tokenBreakdown")}
                  </div>
                </TableHead>
                <TableHead>{t("common.event")}</TableHead>
                <TableHead>{t("dashboard.recent.platformHost")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-muted-foreground h-24 text-center"
                  >
                    {t("dashboard.recent.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                pagination.pageRows.map((event) => {
                  const sessionDetailUrl = `/sessions/${event.session_pk}`;

                  return (
                    <TableRow key={event.id}>
                      <TableCell className="overflow-hidden">
                        <span className="block truncate">
                          {formatDateTime(event.observed_at)}
                        </span>
                      </TableCell>
                      <TableCell className="overflow-hidden">
                        <Link
                          to={sessionDetailUrl}
                          title={event.session_id}
                          className="text-foreground hover:text-ring inline-flex max-w-full items-center gap-1 font-mono text-xs underline-offset-4 hover:underline"
                        >
                          <span className="min-w-0 truncate">
                            {shortSessionId(event.session_id)}
                          </span>
                          <ExternalLink className="text-muted-foreground size-3 shrink-0" />
                        </Link>
                      </TableCell>
                      <TableCell className="overflow-hidden">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-7 max-w-full px-2 text-xs"
                        >
                          <Link
                            to={`${sessionDetailUrl}?turn=${event.turn_index}`}
                            title={t("dashboard.recent.openTurnTitle")}
                          >
                            <span className="truncate">
                              {t("dashboard.recent.openTurn", {
                                turn: event.turn_index,
                              })}
                            </span>
                            <ArrowRight className="size-3.5 shrink-0" />
                          </Link>
                        </Button>
                      </TableCell>
                      <TableCell className="overflow-hidden">
                        <span className="block truncate">{event.llm_model}</span>
                      </TableCell>
                      <TableCell className="overflow-hidden">
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {agentDisplayName(event.agent_name)}
                          </div>
                          {event.agent_version ? (
                            <div className="text-muted-foreground truncate text-xs">
                              {event.agent_version}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <div className="font-medium">
                          {formatNumber(event.total_tokens)}
                        </div>
                        {event.event_type === "request" ? (
                          <div
                            className="text-muted-foreground truncate text-xs"
                            title={t("dashboard.recent.tokenBreakdownTitle", {
                              input: formatNumber(event.input_tokens),
                              cached: formatNumber(event.cache_read_tokens),
                            })}
                          >
                            {compactNumber.format(event.input_tokens)} /{" "}
                            {compactNumber.format(event.cache_read_tokens)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="overflow-hidden">
                        <Badge
                          variant={
                            event.event_type === "request" ? "default" : "secondary"
                          }
                        >
                          {event.event_type === "request"
                            ? t("common.request")
                            : t("common.response")}
                        </Badge>
                      </TableCell>
                      <TableCell className="overflow-hidden">
                        <div className="min-w-0">
                          <div className="truncate">{event.platform ?? "-"}</div>
                          <div className="text-muted-foreground truncate font-mono text-xs">
                            {event.host_name || t("common.unknown")}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {!loading && error === null ? (
        <TablePagination
          pagination={pagination}
          summary={
            serverPagination?.total !== undefined
              ? t("pagination.totalEvents", {
                  count: formatNumber(serverPagination.total),
                })
              : undefined
          }
        />
      ) : null}
    </Card>
  );
}

interface TablePaginationState<T> {
  pageRows: T[];
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  totalRows: number;
  setPageIndex: (pageIndex: number) => void;
  setPageSize: (pageSize: number) => void;
}

function serverTablePagination<T>(
  rows: T[],
  pagination: ServerPagination,
): TablePaginationState<T> {
  const pageCount =
    pagination.total !== undefined
      ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
      : pagination.pageIndex + (pagination.hasNext ? 2 : 1);
  return {
    pageRows: rows,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    pageCount,
    totalRows: pagination.total ?? rows.length,
    setPageIndex: pagination.onPageChange,
    setPageSize: pagination.onPageSizeChange,
  };
}

function useTablePagination<T>(rows: T[]): TablePaginationState<T> {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSizeState] = React.useState(10);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  React.useEffect(() => {
    setPageIndex(0);
  }, [rows]);

  React.useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const pageRows = React.useMemo(() => {
    const start = pageIndex * pageSize;
    return rows.slice(start, start + pageSize);
  }, [pageIndex, pageSize, rows]);

  const setPageSize = (nextPageSize: number): void => {
    setPageSizeState(nextPageSize);
    setPageIndex(0);
  };

  return {
    pageRows,
    pageIndex,
    pageSize,
    pageCount,
    totalRows: rows.length,
    setPageIndex,
    setPageSize,
  };
}

function TablePagination<T>({
  pagination,
  summary,
}: {
  pagination: TablePaginationState<T>;
  /** Replaces the default "rows returned" text. */
  summary?: string;
}) {
  const { t, formatNumber } = useI18n();
  const canGoBack = pagination.pageIndex > 0;
  const canGoForward = pagination.pageIndex < pagination.pageCount - 1;

  return (
    <CardFooter className="flex-col gap-4 border-t pt-4 sm:flex-row sm:justify-between">
      <div className="text-muted-foreground text-sm">
        {summary ??
          t("pagination.rowsReturned", {
            count: formatNumber(pagination.totalRows),
          })}
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t("pagination.rowsPerPage")}</span>
          <Select
            value={pagination.pageSize.toString()}
            onValueChange={(value) => pagination.setPageSize(Number(value))}
          >
            <SelectTrigger className="h-9 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((pageSize) => (
                <SelectItem key={pageSize} value={pageSize.toString()}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <div className="text-sm font-medium">
            {t("pagination.page", {
              page: pagination.pageIndex + 1,
              pageCount: pagination.pageCount,
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="hidden size-8 sm:inline-flex"
              disabled={!canGoBack}
              aria-label={t("pagination.first")}
              onClick={() => pagination.setPageIndex(0)}
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!canGoBack}
              aria-label={t("pagination.previous")}
              onClick={() => pagination.setPageIndex(pagination.pageIndex - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!canGoForward}
              aria-label={t("pagination.next")}
              onClick={() => pagination.setPageIndex(pagination.pageIndex + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="hidden size-8 sm:inline-flex"
              disabled={!canGoForward}
              aria-label={t("pagination.last")}
              onClick={() => pagination.setPageIndex(pagination.pageCount - 1)}
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </CardFooter>
  );
}

interface UsageTotals {
  sessions: number;
  turns: number;
  requests: number;
  responses: number;
  /** Input that was neither read from nor written to a cache. */
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface ChartRow {
  day: string;
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

interface TokenChartWindow {
  from: string;
  to: string;
  startDay: string;
  endDay: string;
  days: number;
}

function summarizeRows(rows: SummaryRow[]): UsageTotals {
  return rows.reduce<UsageTotals>(
    (totals, row) => ({
      sessions: totals.sessions + row.sessions,
      turns: totals.turns + row.turns,
      requests: totals.requests + row.requests,
      responses: totals.responses + row.responses,
      inputTokens: totals.inputTokens + row.input_tokens,
      cacheReadTokens: totals.cacheReadTokens + row.cache_read_tokens,
      cacheWriteTokens: totals.cacheWriteTokens + row.cache_write_tokens,
      outputTokens: totals.outputTokens + row.output_tokens,
      totalTokens: totals.totalTokens + row.total_tokens,
    }),
    {
      sessions: 0,
      turns: 0,
      requests: 0,
      responses: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  );
}

export function chartRowsByDay(
  rows: DailyTokenUsageRow[],
  dateWindow: TokenChartWindow,
): ChartRow[] {
  const grouped = new Map<string, ChartRow>();
  for (const day of utcDayRange(dateWindow.startDay, dateWindow.endDay)) {
    grouped.set(day, {
      day,
      input_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    });
  }

  for (const row of rows) {
    if (row.day === undefined || !grouped.has(row.day)) {
      continue;
    }
    const current = grouped.get(row.day);
    if (current === undefined) {
      continue;
    }
    current.input_tokens += row.input_tokens;
    current.cache_read_tokens += row.cache_read_tokens;
    current.cache_write_tokens += row.cache_write_tokens;
    current.output_tokens += row.output_tokens;
    current.total_tokens += row.total_tokens;
  }

  return [...grouped.values()];
}

export function tokenChartDateWindow(
  range: TokenChartRange,
  now: Date = new Date(),
): TokenChartWindow {
  const days = tokenChartRangeDays(range);
  const end = new Date(now);
  const start = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - days + 1);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
    startDay: formatUtcDay(start),
    endDay: formatUtcDay(end),
    days,
  };
}

function tokenChartRangeDays(range: TokenChartRange): number {
  return (
    tokenChartRangeOptions.find((option) => option.value === range)?.days ??
    tokenChartRangeOptions[0].days
  );
}

function isTokenChartRange(value: string): value is TokenChartRange {
  return tokenChartRangeOptions.some((option) => option.value === value);
}

function utcDayRange(startDay: string, endDay: string): string[] {
  const days: string[] = [];
  const current = parseUtcDay(startDay);
  const end = parseUtcDay(endDay);

  while (current <= end) {
    days.push(formatUtcDay(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

function parseUtcDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDay(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join("-");
}

function countAgentProducts(rows: SummaryRow[]): number {
  return new Set(
    rows
      .map((row) => row.agent_name)
      .filter((agentName): agentName is string => Boolean(agentName))
      .map(agentProductKey),
  ).size;
}

function createDefaultFilters(): FilterDraft {
  return {
    time: createTimeRange("7d"),
    ...defaultNonDateFilters,
  };
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
