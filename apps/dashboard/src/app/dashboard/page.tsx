"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  MessageSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie as RechartsPie,
  PieChart as RechartsPieChart,
  XAxis,
  YAxis,
} from "recharts";
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
import { Badge } from "@abyss/ui";
import { Button } from "@abyss/ui";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@abyss/ui";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@abyss/ui";
import { Input } from "@abyss/ui";
import { Label } from "@abyss/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@abyss/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@abyss/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@abyss/ui";
import { ToggleGroup, ToggleGroupItem } from "@abyss/ui";
import { useI18n } from "@/hooks/use-i18n";
import { agentDisplayName, agentFilterOptions, agentProductKey } from "@/lib/agents";

interface FilterDraft {
  from: string;
  to: string;
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
} satisfies Omit<FilterDraft, "from" | "to">;

const providerOptions = ["openai", "anthropic"] as const;
const pageSizeOptions = [10, 20, 50] as const;
const recentEventTextPreviewMaxCharacters = 700;
const tokenChartRangeOptions = [
  { value: "7d", days: 7, labelKey: "dashboard.tokenChart.range7Days" },
  { value: "30d", days: 30, labelKey: "dashboard.tokenChart.range30Days" },
  { value: "90d", days: 90, labelKey: "dashboard.tokenChart.range90Days" },
] as const;
const usageChartColors = [
  "oklch(0.74 0.18 156)",
  "oklch(0.69 0.14 188)",
  "oklch(0.82 0.16 112)",
  "oklch(0.68 0.16 218)",
  "oklch(0.78 0.14 75)",
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
  const query = React.useMemo<UsageQuery>(
    () => ({
      from: toUtcIso(filters.from),
      to: toUtcIso(filters.to),
      agentName: filters.agentName,
      sessionId: filters.sessionId,
      provider: filters.provider,
      model: filters.model,
      eventType: filters.eventType === "all" ? "" : filters.eventType,
    }),
    [filters],
  );
  const tokenChartWindow = React.useMemo(
    () => tokenChartDateWindow(tokenChartRange),
    [tokenChartRange],
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
  const agentDistributionSummaryQuery = useQuery({
    queryKey: ["usage-summary", "agent-distribution", query],
    queryFn: () => fetchUsageSummary(query, { groupBy: ["agent"] }),
  });
  const chartSummaryQuery = useQuery({
    queryKey: ["usage-summary", "token-chart", chartQuery],
    queryFn: () => fetchDailyTokenUsage(chartQuery),
  });
  const eventsQuery = useQuery({
    queryKey: ["usage-events", query],
    queryFn: () => fetchRawEvents(query),
  });

  const rows = React.useMemo(
    () => summaryQuery.data?.rows ?? [],
    [summaryQuery.data?.rows],
  );
  const chartSummaryRows = React.useMemo(
    () => chartSummaryQuery.data?.rows ?? [],
    [chartSummaryQuery.data?.rows],
  );
  const agentDistributionRows = React.useMemo(
    () => agentDistributionSummaryQuery.data?.rows ?? [],
    [agentDistributionSummaryQuery.data?.rows],
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

  return (
    <BaseLayout title={t("dashboard.title")} description={t("dashboard.description")}>
      <div className="@container/main space-y-6 px-4 lg:px-6">
        <UsageFilters
          draft={draft}
          onDraftChange={setDraft}
          onApply={() => setFilters(draft)}
          onReset={() => {
            const nextFilters = createDefaultFilters();
            setDraft(nextFilters);
            setFilters(nextFilters);
          }}
        />

        {summaryQuery.isError ? (
          <StatusCard
            title={t("dashboard.summaryError")}
            detail={summaryQuery.error.message}
          />
        ) : null}
        {chartSummaryQuery.isError ? (
          <StatusCard
            title={t("dashboard.chart.error")}
            detail={chartSummaryQuery.error.message}
          />
        ) : null}
        {agentDistributionSummaryQuery.isError ? (
          <StatusCard
            title={t("dashboard.summaryError")}
            detail={agentDistributionSummaryQuery.error.message}
          />
        ) : null}

        <MetricCards
          totals={totals}
          agentCount={agentCount}
          loading={summaryQuery.isLoading}
        />

        <AgentDistributionChart
          rows={agentDistributionRows}
          loading={agentDistributionSummaryQuery.isLoading}
        />

        <TokenChart
          rows={chartRows}
          loading={chartSummaryQuery.isLoading}
          range={tokenChartRange}
          onRangeChange={setTokenChartRange}
        />

        <SummaryTable rows={rows} loading={summaryQuery.isLoading} />

        <RawEventsTable
          events={events}
          loading={eventsQuery.isLoading}
          error={eventsQuery.error}
        />
      </div>
    </BaseLayout>
  );
}

interface UsageFiltersProps {
  draft: FilterDraft;
  onDraftChange: (draft: FilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
}

function UsageFilters({ draft, onDraftChange, onApply, onReset }: UsageFiltersProps) {
  const { t } = useI18n();
  const update = (field: keyof FilterDraft, value: string): void => {
    onDraftChange({ ...draft, [field]: value });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.filters.title")}</CardTitle>
        <CardDescription>{t("dashboard.filters.description")}</CardDescription>
        <CardAction className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RefreshCw className="size-4" />
            {t("common.reset")}
          </Button>
          <Button size="sm" onClick={onApply}>
            <Search className="size-4" />
            {t("common.apply")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <Field label={t("common.from")}>
          <Input
            type="datetime-local"
            value={draft.from}
            onChange={(event) => update("from", event.target.value)}
          />
        </Field>
        <Field label={t("common.to")}>
          <Input
            type="datetime-local"
            value={draft.to}
            onChange={(event) => update("to", event.target.value)}
          />
        </Field>
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
          <Input
            value={draft.model}
            onChange={(event) => update("model", event.target.value)}
          />
        </Field>
        <Field label={t("common.session")}>
          <Input
            value={draft.sessionId}
            onChange={(event) => update("sessionId", event.target.value)}
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
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function MetricCards({
  totals,
  agentCount,
  loading,
}: {
  totals: UsageTotals;
  agentCount: number;
  loading: boolean;
}) {
  const { t, formatNumber } = useI18n();
  const cards = [
    {
      label: t("dashboard.metric.totalTokens"),
      value: totals.totalTokens,
      icon: Database,
      detail: t("dashboard.metric.inputOutput", {
        input: formatNumber(totals.inputTokens),
        output: formatNumber(totals.outputTokens),
      }),
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
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="@container/card">
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {loading ? "..." : formatNumber(card.value)}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <card.icon className="size-3.5" />
                {t("common.live")}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {card.detail}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TokenChart({
  rows,
  loading,
  range,
  onRangeChange,
}: {
  rows: ChartRow[];
  loading: boolean;
  range: TokenChartRange;
  onRangeChange: (range: TokenChartRange) => void;
}) {
  const { t, formatNumber } = useI18n();
  const hasUsage = React.useMemo(
    () => rows.some((row) => row.input_tokens > 0 || row.total_tokens > 0),
    [rows],
  );
  const chartConfig = React.useMemo(
    () =>
      ({
        total_tokens: {
          label: t("dashboard.metric.totalTokens"),
          color: "var(--primary)",
        },
        input_tokens: {
          label: t("dashboard.tokenChart.inputTokens"),
          color: "var(--chart-2)",
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
        {loading ? (
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
                <linearGradient id="fillTotalTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-total_tokens)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-total_tokens)"
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
                width={78}
                tickMargin={8}
                allowDecimals={false}
                domain={[0, "auto"]}
                tickFormatter={(value) => formatNumber(Number(value))}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Area
                dataKey="input_tokens"
                type="monotone"
                fill="var(--color-input_tokens)"
                fillOpacity={0.14}
                stroke="var(--color-input_tokens)"
                stackId="a"
              />
              <Area
                dataKey="total_tokens"
                type="monotone"
                fill="url(#fillTotalTokens)"
                stroke="var(--color-total_tokens)"
                stackId="b"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function AgentDistributionChart({
  rows,
  loading,
}: {
  rows: SummaryRow[];
  loading: boolean;
}) {
  const { t, formatNumber } = useI18n();
  const agentDistributionChartConfig = React.useMemo(
    () =>
      ({
        total_tokens: {
          label: t("dashboard.metric.totalTokens"),
        },
      }) satisfies ChartConfig,
    [t],
  );
  const distributedAgentRows = React.useMemo(() => agentDistributionRows(rows), [rows]);

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle>{t("dashboard.agentDistribution.title")}</CardTitle>
        <CardDescription>
          {t("dashboard.agentDistribution.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        {loading ? (
          <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
            {t("dashboard.agentDistribution.loading")}
          </div>
        ) : distributedAgentRows.length === 0 ? (
          <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
            {t("dashboard.agentDistribution.empty")}
          </div>
        ) : (
          <div className="mx-auto grid max-w-[620px] items-center gap-3 md:grid-cols-[260px_220px]">
            <ChartContainer
              config={agentDistributionChartConfig}
              className="recharts-no-focus aspect-auto h-[220px] w-full"
            >
              <RechartsPieChart accessibilityLayer={false}>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent nameKey="agent" />}
                />
                <RechartsPie
                  data={distributedAgentRows}
                  dataKey="total_tokens"
                  nameKey="agent"
                  innerRadius={44}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {distributedAgentRows.map((row) => (
                    <Cell key={row.agent} fill={row.fill} />
                  ))}
                </RechartsPie>
              </RechartsPieChart>
            </ChartContainer>
            <div className="flex flex-col justify-center gap-2.5">
              {distributedAgentRows.map((row) => (
                <div key={row.agent} className="grid gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 rounded-sm"
                        style={{ backgroundColor: row.fill }}
                      />
                      <span className="truncate text-sm font-medium">{row.agent}</span>
                    </div>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {row.share}%
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs tabular-nums">
                    {formatNumber(row.total_tokens)} {t("common.tokens")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTable({ rows, loading }: { rows: SummaryRow[]; loading: boolean }) {
  const { t, formatNumber } = useI18n();
  const pagination = useTablePagination(rows);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.summary.title")}</CardTitle>
        <CardDescription>{t("dashboard.summary.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground py-10 text-center text-sm">
            {t("dashboard.summary.loading")}
          </div>
        ) : (
          <Table className="w-[min(1200px,100%)] min-w-[820px] table-fixed">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[18%]" />
              <col className="w-[36%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.agent")}</TableHead>
                <TableHead>{t("common.provider")}</TableHead>
                <TableHead>{t("common.model")}</TableHead>
                <TableHead>{t("common.session")}</TableHead>
                <TableHead>{t("common.turns")}</TableHead>
                <TableHead>{t("common.tokens")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground h-24 text-center"
                  >
                    {t("dashboard.summary.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                pagination.pageRows.map((row) => (
                  <TableRow key={summaryKey(row)}>
                    <TableCell className="truncate">
                      {row.agent_name ? agentDisplayName(row.agent_name) : "-"}
                    </TableCell>
                    <TableCell className="truncate">
                      {row.llm_provider ?? "-"}
                    </TableCell>
                    <TableCell className="truncate">{row.llm_model ?? "-"}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(row.sessions)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(row.turns)}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {formatNumber(row.total_tokens)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {!loading ? <TablePagination pagination={pagination} /> : null}
    </Card>
  );
}

export function RawEventsTable({
  events,
  loading,
  error,
}: {
  events: UsageEvent[];
  loading: boolean;
  error: Error | null;
}) {
  const { t, formatNumber, formatDateTime } = useI18n();
  const pagination = useTablePagination(events);
  const [openTextEventId, setOpenTextEventId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOpenTextEventId(null);
  }, [events]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.recent.title")}</CardTitle>
        <CardDescription>{t("dashboard.recent.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-destructive py-10 text-center text-sm">
            {error.message}
          </div>
        ) : loading ? (
          <div className="text-muted-foreground py-10 text-center text-sm">
            {t("dashboard.recent.loading")}
          </div>
        ) : (
          <Table className="w-full min-w-[1280px] table-fixed">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[22%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.observed")}</TableHead>
                <TableHead>{t("common.session")}</TableHead>
                <TableHead>{t("common.agent")}</TableHead>
                <TableHead>{t("dashboard.recent.platformHost")}</TableHead>
                <TableHead>{t("common.event")}</TableHead>
                <TableHead>{t("common.model")}</TableHead>
                <TableHead>{t("table.text")}</TableHead>
                <TableHead>{t("common.tokens")}</TableHead>
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
                  const textPreview = recentEventTextPreview(event.text);
                  const sessionDetailUrl = `/sessions/${event.session_pk}`;

                  return (
                    <TableRow key={event.id}>
                      <TableCell className="overflow-hidden">
                        <span className="block truncate">
                          {formatDateTime(event.observed_at)}
                        </span>
                      </TableCell>
                      <TableCell className="overflow-hidden">
                        <Button
                          asChild
                          variant="link"
                          className="h-auto w-full min-w-0 justify-start p-0 font-mono text-xs"
                        >
                          <Link to={sessionDetailUrl} className="min-w-0">
                            <span className="min-w-0 truncate">{event.session_id}</span>
                            <ExternalLink className="size-3.5" />
                          </Link>
                        </Button>
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
                      <TableCell className="overflow-hidden">
                        <div className="min-w-0">
                          <div className="truncate">{event.platform ?? "-"}</div>
                          <div className="text-muted-foreground truncate font-mono text-xs">
                            {event.host_name || t("common.unknown")}
                          </div>
                        </div>
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
                        <span className="block truncate">{event.llm_model}</span>
                      </TableCell>
                      <TableCell className="max-w-0 overflow-hidden whitespace-normal align-top">
                        <div className="grid w-full min-w-0 max-w-full grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2">
                          <Popover
                            open={openTextEventId === event.id}
                            onOpenChange={(open) =>
                              setOpenTextEventId(open ? event.id : null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0"
                                aria-label={
                                  openTextEventId === event.id
                                    ? t("dashboard.recent.hideText")
                                    : t("dashboard.recent.showText")
                                }
                              >
                                {openTextEventId === event.id ? (
                                  <EyeOff className="size-4" />
                                ) : (
                                  <Eye className="size-4" />
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              side="left"
                              className="w-[min(560px,calc(100vw-2rem))] overflow-hidden p-0 data-[state=closed]:animate-none data-[state=open]:animate-none"
                            >
                              <RecentEventTextPreview
                                textPreview={textPreview}
                                sessionDetailUrl={sessionDetailUrl}
                              />
                            </PopoverContent>
                          </Popover>
                          <div className="min-w-0 max-w-full overflow-hidden">
                            <div className="text-muted-foreground truncate leading-7">
                              {t("dashboard.recent.hidden")}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {formatNumber(event.total_tokens)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {!loading && error === null ? <TablePagination pagination={pagination} /> : null}
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

function TablePagination<T>({ pagination }: { pagination: TablePaginationState<T> }) {
  const { t, formatNumber } = useI18n();
  const canGoBack = pagination.pageIndex > 0;
  const canGoForward = pagination.pageIndex < pagination.pageCount - 1;

  return (
    <CardFooter className="flex-col gap-4 border-t pt-4 sm:flex-row sm:justify-between">
      <div className="text-muted-foreground text-sm">
        {t("pagination.rowsReturned", {
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

function StatusCard({ title, detail }: { title: string; detail: string }) {
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
    </Card>
  );
}

interface UsageTotals {
  sessions: number;
  turns: number;
  requests: number;
  responses: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface ChartRow {
  day: string;
  input_tokens: number;
  total_tokens: number;
}

interface TokenChartWindow {
  from: string;
  to: string;
  startDay: string;
  endDay: string;
  days: number;
}

interface AgentDistributionRow {
  [key: string]: string | number;
  agent: string;
  total_tokens: number;
  share: number;
  fill: string;
}

function summarizeRows(rows: SummaryRow[]): UsageTotals {
  return rows.reduce<UsageTotals>(
    (totals, row) => ({
      sessions: totals.sessions + row.sessions,
      turns: totals.turns + row.turns,
      requests: totals.requests + row.requests,
      responses: totals.responses + row.responses,
      inputTokens: totals.inputTokens + row.input_tokens,
      outputTokens: totals.outputTokens + row.output_tokens,
      totalTokens: totals.totalTokens + row.total_tokens,
    }),
    {
      sessions: 0,
      turns: 0,
      requests: 0,
      responses: 0,
      inputTokens: 0,
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

function agentDistributionRows(rows: SummaryRow[]): AgentDistributionRow[] {
  const grouped = new Map<string, { agent: string; total_tokens: number }>();
  for (const row of rows) {
    const agentKey = agentProductKey(row.agent_name);
    const current = grouped.get(agentKey) ?? {
      agent: agentDisplayName(row.agent_name),
      total_tokens: 0,
    };
    current.total_tokens += row.total_tokens;
    grouped.set(agentKey, current);
  }

  const totalTokens = [...grouped.values()].reduce(
    (total, value) => total + value.total_tokens,
    0,
  );
  return [...grouped.values()]
    .filter(({ total_tokens }) => total_tokens > 0)
    .sort((left, right) => right.total_tokens - left.total_tokens)
    .map(({ agent, total_tokens }, index) => ({
      agent,
      total_tokens,
      share: totalTokens > 0 ? Math.round((total_tokens / totalTokens) * 100) : 0,
      fill: usageChartColor(index),
    }));
}

function usageChartColor(index: number): string {
  return usageChartColors[index % usageChartColors.length];
}

function countAgentProducts(rows: SummaryRow[]): number {
  return new Set(
    rows
      .map((row) => row.agent_name)
      .filter((agentName): agentName is string => Boolean(agentName))
      .map(agentProductKey),
  ).size;
}

function RecentEventTextPreview({
  textPreview,
  sessionDetailUrl,
}: {
  textPreview: {
    text: string;
    truncated: boolean;
  };
  sessionDetailUrl: string;
}) {
  const { t } = useI18n();
  const previewRef = React.useRef<HTMLDivElement>(null);
  const [previewOverflows, setPreviewOverflows] = React.useState(false);

  React.useLayoutEffect(() => {
    const preview = previewRef.current;
    if (preview === null) {
      return;
    }

    const updatePreviewOverflow = () => {
      setPreviewOverflows(
        preview.scrollWidth > preview.clientWidth ||
          preview.scrollHeight > preview.clientHeight,
      );
    };

    updatePreviewOverflow();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePreviewOverflow);
    resizeObserver?.observe(preview);
    window.addEventListener("resize", updatePreviewOverflow);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePreviewOverflow);
    };
  }, [textPreview.text]);

  const shouldShowSessionDetailLink = textPreview.truncated || previewOverflows;

  return (
    <>
      <div ref={previewRef} className="truncate p-3 font-mono text-xs">
        {textPreview.text}
      </div>
      {shouldShowSessionDetailLink ? (
        <div className="bg-muted/40 text-muted-foreground border-t px-3 py-2 text-xs">
          <div>{t("dashboard.recent.previewTruncated")}</div>
          <Button asChild variant="link" className="mt-1 h-auto p-0 text-xs">
            <Link to={sessionDetailUrl}>
              {t("dashboard.recent.openSessionDetail")}
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}

function recentEventTextPreview(text: string | null): {
  text: string;
  truncated: boolean;
} {
  if (text === null || text.length === 0) {
    return { text: "-", truncated: false };
  }

  if (text.length <= recentEventTextPreviewMaxCharacters) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, recentEventTextPreviewMaxCharacters).trimEnd()}...`,
    truncated: true,
  };
}

function createDefaultFilters(): FilterDraft {
  const to = new Date();
  to.setSeconds(0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - 7);

  return {
    from: toDateTimeLocalInputValue(from),
    to: toDateTimeLocalInputValue(to),
    ...defaultNonDateFilters,
  };
}

function toDateTimeLocalInputValue(date: Date): string {
  return (
    [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-") +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function toUtcIso(value: string): string | undefined {
  if (value.length === 0) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function summaryKey(row: SummaryRow): string {
  return [row.day, row.agent_name, row.llm_provider, row.llm_model, row.event_type]
    .filter((value): value is string => value !== undefined)
    .join(":");
}
