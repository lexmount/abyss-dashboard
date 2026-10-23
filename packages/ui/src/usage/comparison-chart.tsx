import { useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { RotateCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { Button } from "../components/button";
import { Label } from "../components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/chart";
import { UsageValueFilter } from "./value-filter";
import {
  comparisonDimensions,
  comparisonPoints,
  comparisonSeries,
  type ComparisonDimension,
  type UsageBucket,
  type UsageComparisonData,
  type UsageComparisonLabels,
  type UsageComparisonSelection,
  type UsageFilterDimension,
} from "./comparison-model";
import { cn } from "../utils";

export interface UsageChartStatus {
  loading: boolean;
  updating: boolean;
  error: boolean;
  onRetry: () => void;
}
export function UsageChartState({
  status,
  labels,
  children,
  invalid = false,
}: {
  status: UsageChartStatus;
  labels: UsageComparisonLabels;
  children: React.ReactNode;
  invalid?: boolean;
}) {
  if (invalid)
    return (
      <div
        role="alert"
        className="text-muted-foreground flex h-64 items-center justify-center text-sm"
      >
        {labels.invalidRange}
      </div>
    );
  if (status.error)
    return (
      <div
        role="alert"
        className="flex h-64 items-center justify-center gap-3 text-sm"
      >
        <span>{labels.error}</span>
        <Button variant="outline" size="sm" onClick={status.onRetry}>
          {labels.retry}
        </Button>
      </div>
    );
  if (status.loading)
    return (
      <div
        role="status"
        className="text-muted-foreground flex h-64 items-center justify-center text-sm"
      >
        {labels.loading}
      </div>
    );
  return children;
}

export function UsageComparisonChart({
  selection,
  onChange,
  buckets,
  data,
  status,
  labels,
  locale,
  timeRangeControl,
  invalidRange = false,
}: {
  selection: UsageComparisonSelection;
  onChange: (value: UsageComparisonSelection) => void;
  buckets: UsageBucket[];
  data?: UsageComparisonData;
  status: UsageChartStatus;
  labels: UsageComparisonLabels;
  locale: string;
  timeRangeControl: ReactNode;
  invalidRange?: boolean;
}) {
  const rows = data?.rows ?? [];
  const series = useMemo(() => comparisonSeries(data?.rows ?? []), [data]);
  const points = useMemo(
    () => comparisonPoints(buckets, data?.rows ?? []),
    [buckets, data],
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const compact = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const number = new Intl.NumberFormat(locale);
  const hourly =
    buckets.length > 0 &&
    buckets.every(
      (bucket) => Date.parse(bucket.end) - Date.parse(bucket.start) <= 3600_000,
    );
  const date = new Intl.DateTimeFormat(
    locale,
    hourly
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric" },
  );
  const fullDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const config = Object.fromEntries(
    series.map((item) => [item.key, { label: item.value, color: item.color }]),
  );
  const filters = (
    [
      "agent",
      "model",
      "provider",
      "platform",
      "session",
    ] as UsageFilterDimension[]
  ).filter((dimension) => dimension !== selection.dimension);
  return (
    <Card className="gap-5 shadow-none">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle>{labels.tokens}</CardTitle>
          <Button
            size="icon"
            variant="ghost"
            aria-label={labels.refresh}
            onClick={status.onRetry}
            disabled={status.updating}
          >
            <RotateCw
              className={cn("size-4", status.updating && "animate-spin")}
            />
          </Button>
        </div>
        <div
          className="dashboard-filter-grid grid gap-4"
          data-time-range={selection.range}
        >
          {timeRangeControl}
          <div className="grid min-w-0 gap-2">
            <Label>{labels.dimension}</Label>
            <Select
              value={selection.dimension}
              onValueChange={(dimension) =>
                onChange({
                  ...selection,
                  dimension: dimension as ComparisonDimension,
                })
              }
            >
              <SelectTrigger aria-label={labels.dimension} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {comparisonDimensions.map((dimension) => (
                  <SelectItem
                    key={dimension}
                    value={dimension}
                    disabled={selection.filters[dimension].length > 0}
                  >
                    {labels.dimensions[dimension]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filters.map((dimension) => (
            <div className="grid min-w-0 gap-2" key={dimension}>
              <Label>{labels.dimensions[dimension]}</Label>
              <UsageValueFilter
                label={labels.dimensions[dimension]}
                labels={labels}
                value={selection.filters[dimension]}
                options={(data?.options ?? [])
                  .filter((option) => option.dimension === dimension)
                  .map((option) => option.value)}
                allowCustom={dimension === "session"}
                onChange={(values) =>
                  onChange({
                    ...selection,
                    filters: { ...selection.filters, [dimension]: values },
                  })
                }
              />
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="min-h-[286px] space-y-4">
        <UsageChartState
          status={status}
          labels={labels}
          invalid={invalidRange || !buckets.length}
        >
          {!rows.length ? (
            <div className="text-muted-foreground flex h-[250px] items-center justify-center text-sm">
              {labels.empty}
            </div>
          ) : (
            <>
              <ChartContainer
                config={config}
                aria-label={labels.tokens}
                aria-busy={status.updating}
                className="aspect-auto h-[250px] w-full"
              >
                <AreaChart
                  data={points}
                  margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(value) =>
                      date.format(new Date(Number(value)))
                    }
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                    tickMargin={8}
                  />
                  <YAxis
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickMargin={8}
                    domain={[0, "auto"]}
                    tickFormatter={(value) => compact.format(Number(value))}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) => {
                          const bucket = payload[0]?.payload?.bucket;
                          return typeof bucket === "number" &&
                            Number.isFinite(bucket)
                            ? fullDate.format(new Date(bucket))
                            : null;
                        }}
                      />
                    }
                  />
                  {series.map((item) => (
                    <Area
                      key={item.key}
                      dataKey={item.key}
                      name={item.value}
                      stroke={item.color}
                      strokeDasharray={item.dash}
                      fill={item.color}
                      fillOpacity={0.3}
                      dot={points.length === 1}
                      activeDot={{ r: 4 }}
                      type="monotone"
                      hide={hidden.has(item.value)}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ChartContainer>
              <div
                className="flex max-h-28 flex-wrap gap-x-5 gap-y-2 overflow-y-auto"
                aria-label={labels.dimension}
              >
                {series.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    aria-pressed={!hidden.has(item.value)}
                    onClick={() =>
                      setHidden((current) => {
                        const next = new Set(current);
                        if (next.has(item.value)) next.delete(item.value);
                        else next.add(item.value);
                        return next;
                      })
                    }
                    className={cn(
                      "flex min-w-0 items-center gap-2 text-sm",
                      hidden.has(item.value) && "opacity-40",
                    )}
                    title={item.value + " · " + number.format(item.total)}
                  >
                    <span
                      className="h-0.5 w-4 shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="max-w-64 truncate">{item.value}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {compact.format(item.total)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </UsageChartState>
      </CardContent>
    </Card>
  );
}
