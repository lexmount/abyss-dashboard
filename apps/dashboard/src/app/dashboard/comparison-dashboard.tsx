import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  UsageComparisonChart,
  UsageActivityHeatmap,
  defaultComparison,
  emptyUsageFilters,
  comparisonBuckets,
  activityBuckets,
  type UsageComparisonLabels,
  type UsageComparisonData,
  type UsageBucket,
  type UsageFiltersValue,
  type ComparisonDimension,
} from "@lexmount.com/abyss-ui";
import { TimeRangeField } from "@/components/time-range-field";
import { fetchJson } from "@/api/http";
import { useI18n } from "@/hooks/use-i18n";

export function ComparisonDashboard({
  scope = "mine",
  enabled = true,
}: {
  scope?: "mine" | "global";
  enabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [selection, setSelection] = useState(() => defaultComparison(now));
  const [activityNow, setActivityNow] = useState(() => new Date());
  const [activityFilters, setActivityFilters] = useState(emptyUsageFilters);
  const buckets = useMemo(() => comparisonBuckets(selection, now), [selection, now]);
  const days = useMemo(() => activityBuckets(activityNow), [activityNow]);
  const comparison = useQuery({
    queryKey: [
      "usage-comparison",
      scope,
      selection.dimension,
      buckets,
      selection.filters,
    ],
    // Keep each response paired with its original time axis during background updates.
    queryFn: async ({ signal }) => ({
      data: await fetchComparison(
        scope,
        selection.dimension,
        buckets,
        selection.filters,
        signal,
      ),
      buckets,
    }),
    placeholderData: (previous, query) =>
      query?.queryKey[1] === scope ? keepPreviousData(previous) : undefined,
    enabled: enabled && buckets.length > 0,
  });
  const activity = useQuery({
    queryKey: ["usage-activity", scope, days, activityFilters],
    queryFn: async ({ signal }) => ({
      data: await fetchComparison(scope, null, days, activityFilters, signal),
      buckets: days,
    }),
    placeholderData: (previous, query) =>
      query?.queryKey[1] === scope ? keepPreviousData(previous) : undefined,
    enabled,
  });
  const labels: UsageComparisonLabels = {
    tokens: t("comparison.tokens"),
    activity: t("comparison.activity"),
    dimension: t("comparison.dimension"),
    dimensions: {
      agent: t("comparison.agent"),
      model: t("common.model"),
      provider: t("common.provider"),
      platform: t("comparison.platform"),
      session: "Session ID",
    },
    all: t("common.all"),
    search: t("comparison.search"),
    empty: t("comparison.empty"),
    loading: t("comparison.loading"),
    error: t("comparison.error"),
    retry: t("comparison.retry"),
    refresh: t("dashboard.refresh"),
    less: t("comparison.less"),
    more: t("comparison.more"),
    invalidRange: t("comparison.invalidRange"),
    add: t("comparison.add"),
    clear: t("comparison.clear"),
    requests: t("comparison.requests"),
  };
  const refreshComparison = () => {
    if (selection.range === "custom") void comparison.refetch();
    else setNow(new Date());
  };
  return (
    <div className="space-y-6">
      <UsageComparisonChart
        selection={selection}
        onChange={setSelection}
        buckets={comparison.data?.buckets ?? buckets}
        data={comparison.data?.data}
        invalidRange={!buckets.length}
        timeRangeControl={
          <TimeRangeField
            value={{ preset: selection.range, from: selection.from, to: selection.to }}
            presets={["24h", "7d", "30d", "custom"]}
            onChange={(time) => {
              if (time.preset !== "any") {
                setSelection({
                  ...selection,
                  range: time.preset,
                  from: time.from,
                  to: time.to,
                });
              }
            }}
          />
        }
        status={{
          loading: comparison.isLoading,
          updating: comparison.isFetching,
          error: comparison.isError,
          onRetry: refreshComparison,
        }}
        labels={labels}
        locale={locale}
      />
      <UsageActivityHeatmap
        filters={activityFilters}
        onChange={setActivityFilters}
        buckets={activity.data?.buckets ?? days}
        data={activity.data?.data}
        status={{
          loading: activity.isLoading,
          updating: activity.isFetching,
          error: activity.isError,
          onRetry: () => {
            const next = new Date();
            if (activityBuckets(next)[0].start === days[0].start)
              void activity.refetch();
            else setActivityNow(next);
          },
        }}
        labels={labels}
        locale={locale}
      />
    </div>
  );
}

export function fetchComparison(
  scope: "mine" | "global",
  dimension: ComparisonDimension | null,
  buckets: UsageBucket[],
  filters: UsageFiltersValue,
  signal?: AbortSignal,
): Promise<UsageComparisonData> {
  return fetchJson(
    "/api/v1/agent-usage/comparison" + (scope === "global" ? "?scope=global" : ""),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ group_by: dimension, buckets, filters }),
    },
  );
}
