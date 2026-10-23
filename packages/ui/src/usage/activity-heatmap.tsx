import { useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { Button } from "../components/button";
import { Label } from "../components/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { UsageValueFilter } from "./value-filter";
import { UsageChartState, type UsageChartStatus } from "./comparison-chart";
import {
  comparisonDimensions,
  type UsageBucket,
  type UsageComparisonData,
  type UsageComparisonLabels,
  type UsageFiltersValue,
} from "./comparison-model";
import { cn } from "../utils";

export function UsageActivityHeatmap({
  filters,
  onChange,
  buckets,
  data,
  status,
  labels,
  locale,
}: {
  filters: UsageFiltersValue;
  onChange: (value: UsageFiltersValue) => void;
  buckets: UsageBucket[];
  data?: UsageComparisonData;
  status: UsageChartStatus;
  labels: UsageComparisonLabels;
  locale: string;
}) {
  const cells = useMemo(() => {
    const counts = new Map<number, { tokens: number; requests: number }>();
    for (const row of data?.rows ?? []) {
      const current = counts.get(row.bucket) ?? { tokens: 0, requests: 0 };
      counts.set(row.bucket, {
        tokens: current.tokens + row.total_tokens,
        requests: current.requests + row.requests,
      });
    }
    return buckets.map((bucket) => ({
      date: new Date(bucket.start),
      ...(counts.get(Date.parse(bucket.start)) ?? { tokens: 0, requests: 0 }),
    }));
  }, [buckets, data]);
  const offset = cells[0]?.date.getDay() ?? 0;
  const weeks = Math.ceil((offset + cells.length) / 7);
  const max = Math.max(1, ...cells.map((cell) => cell.tokens));
  const month = new Intl.DateTimeFormat(locale, { month: "short" });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const number = new Intl.NumberFormat(locale);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const [focused, setFocused] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const monthStarts = cells.flatMap((cell, index) => {
    const week = Math.floor((index + offset) / 7);
    if (index === 0 || cell.date.getDate() === 1)
      return [{ label: month.format(cell.date), week }];
    return [];
  });
  const months = monthStarts.filter(
    (_, index) => index > 0 || !monthStarts[1] || monthStarts[1].week > 1,
  );
  return (
    <Card className="gap-5 shadow-none">
      <CardHeader className="gap-4">
        <div className="flex items-center justify-between gap-4">
          <CardTitle>{labels.activity}</CardTitle>
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
        <div className="dashboard-filter-grid grid gap-4">
          {comparisonDimensions.map((dimension) => (
            <div className="grid min-w-0 gap-2" key={dimension}>
              <Label>{labels.dimensions[dimension]}</Label>
              <UsageValueFilter
                label={labels.dimensions[dimension]}
                labels={labels}
                value={filters[dimension]}
                options={(data?.options ?? [])
                  .filter((option) => option.dimension === dimension)
                  .map((option) => option.value)}
                onChange={(value) =>
                  onChange({ ...filters, [dimension]: value })
                }
              />
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <UsageChartState status={status} labels={labels}>
          <div className="overflow-x-auto pb-1" aria-busy={status.updating}>
            <div className="min-w-[720px]">
              <div className="relative mb-2 ml-10 h-5 text-xs text-muted-foreground">
                {months.map((item, index) => (
                  <span
                    key={index}
                    className="absolute"
                    style={{ left: (item.week / weeks) * 100 + "%" }}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="grid w-8 shrink-0 grid-rows-7 gap-1 text-xs text-muted-foreground">
                  {Array.from({ length: 7 }, (_, day) => (
                    <div key={day} className="flex items-center">
                      {[1, 3, 5].includes(day)
                        ? weekday.format(new Date(2026, 0, 4 + day))
                        : ""}
                    </div>
                  ))}
                </div>
                <div
                  ref={grid}
                  className="grid min-w-0 flex-1 gap-1"
                  style={{
                    gridTemplateColumns:
                      "repeat(" + weeks + ", minmax(0, 1fr))",
                  }}
                >
                  {Array.from({ length: weeks }, (_, week) => (
                    <div key={week} className="grid grid-rows-7 gap-1">
                      {Array.from({ length: 7 }, (_, day) => {
                        const index = week * 7 + day - offset;
                        const cell = cells[index];
                        if (!cell)
                          return <span key={day} className="aspect-square" />;
                        const level =
                          cell.tokens === 0
                            ? 0
                            : Math.min(4, Math.ceil((cell.tokens / max) * 4));
                        const text =
                          date.format(cell.date) +
                          " · " +
                          number.format(cell.tokens) +
                          " Token · " +
                          number.format(cell.requests) +
                          " " +
                          labels.requests;
                        return (
                          <Tooltip key={day}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                data-activity-day={index}
                                data-level={level}
                                tabIndex={focused === index ? 0 : -1}
                                aria-label={text}
                                onFocus={() => setFocused(index)}
                                onKeyDown={(event) => {
                                  const delta: Record<string, number> = {
                                    ArrowUp: -1,
                                    ArrowDown: 1,
                                    ArrowLeft: -7,
                                    ArrowRight: 7,
                                    Home: -index,
                                    End: cells.length - 1 - index,
                                  };
                                  if (event.key in delta) {
                                    event.preventDefault();
                                    const next = Math.max(
                                      0,
                                      Math.min(
                                        cells.length - 1,
                                        index + delta[event.key],
                                      ),
                                    );
                                    setFocused(next);
                                    grid.current
                                      ?.querySelector<HTMLButtonElement>(
                                        '[data-activity-day="' + next + '"]',
                                      )
                                      ?.focus();
                                  }
                                }}
                                className="aspect-square rounded-[3px] border border-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                style={{
                                  backgroundColor:
                                    "var(--activity-" + level + ")",
                                }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>{text}</TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                <span className="mr-1">{labels.less}</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <span
                    key={level}
                    className="size-3 rounded-[3px]"
                    style={{ backgroundColor: "var(--activity-" + level + ")" }}
                  />
                ))}
                <span className="ml-1">{labels.more}</span>
              </div>
            </div>
          </div>
        </UsageChartState>
      </CardContent>
    </Card>
  );
}
