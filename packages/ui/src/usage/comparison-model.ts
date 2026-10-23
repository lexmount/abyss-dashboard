/** Presentation contracts shared by both applications; no transport or query state. */
export const comparisonDimensions = [
  "agent",
  "model",
  "provider",
  "platform",
] as const;
export type ComparisonDimension = (typeof comparisonDimensions)[number];
export type UsageFilterDimension = ComparisonDimension | "session";
export type ComparisonRange = "24h" | "7d" | "30d" | "custom";
export type UsageFiltersValue = Record<UsageFilterDimension, string[]>;
export interface UsageBucket {
  start: string;
  end: string;
}
export interface UsageComparisonRow {
  bucket: number;
  value: string;
  total_tokens: number;
  requests: number;
}
export interface UsageComparisonOption {
  dimension: ComparisonDimension;
  value: string;
}
export interface UsageComparisonData {
  rows: UsageComparisonRow[];
  options: UsageComparisonOption[];
}
export interface UsageComparisonSelection {
  dimension: ComparisonDimension;
  range: ComparisonRange;
  from: string;
  to: string;
  filters: UsageFiltersValue;
}
export interface UsageComparisonLabels {
  tokens: string;
  activity: string;
  dimension: string;
  dimensions: Record<UsageFilterDimension, string>;
  all: string;
  search: string;
  empty: string;
  loading: string;
  error: string;
  retry: string;
  refresh: string;
  less: string;
  more: string;
  invalidRange: string;
  add: string;
  clear: string;
  requests: string;
}
export const emptyUsageFilters = (): UsageFiltersValue => ({
  agent: [],
  model: [],
  provider: [],
  platform: [],
  session: [],
});
export function localDateInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
export function defaultComparison(now = new Date()): UsageComparisonSelection {
  const from = new Date(now);
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return {
    dimension: "agent",
    range: "7d",
    from: localDateInput(from),
    to: localDateInput(now),
    filters: emptyUsageFilters(),
  };
}
/** Calendar boundaries use the browser timezone, including 23/25-hour DST days. */
export function comparisonBuckets(
  selection: UsageComparisonSelection,
  now: Date,
): UsageBucket[] {
  const end =
    selection.range === "custom" ? new Date(selection.to) : new Date(now);
  const start =
    selection.range === "custom" ? new Date(selection.from) : new Date(now);
  if (selection.range === "24h") start.setTime(end.getTime() - 24 * 3600_000);
  else if (selection.range !== "custom") {
    start.setDate(start.getDate() - (selection.range === "7d" ? 6 : 29));
    start.setHours(0, 0, 0, 0);
  }
  const duration = end.getTime() - start.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 367 * 86400_000)
    return [];
  const hourly = selection.range === "24h" || duration <= 86400_000;
  const buckets: UsageBucket[] = [];
  let cursor = start;
  while (cursor < end) {
    const next = new Date(cursor);
    if (hourly) next.setTime(cursor.getTime() + 3600_000);
    else {
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
    }
    if (next > end) next.setTime(end.getTime());
    buckets.push({ start: cursor.toISOString(), end: next.toISOString() });
    cursor = next;
  }
  return buckets;
}
export function activityBuckets(now: Date): UsageBucket[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 364);
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return comparisonBuckets(
    {
      ...defaultComparison(now),
      range: "custom",
      from: localDateInput(start),
      to: localDateInput(end),
    },
    now,
  );
}
export function comparisonSeries(rows: readonly UsageComparisonRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows)
    totals.set(row.value, (totals.get(row.value) ?? 0) + row.total_tokens);
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, total], index) => ({
      value,
      total,
      key: "series" + index,
      color: "var(--chart-" + ((index % 5) + 1) + ")",
      dash: index < 5 ? undefined : index < 10 ? "6 3" : "2 3",
    }));
}
export function comparisonPoints(
  buckets: readonly UsageBucket[],
  rows: readonly UsageComparisonRow[],
) {
  const series = comparisonSeries(rows);
  const keys = new Map(series.map((item) => [item.value, item.key]));
  const points = buckets.map(
    (bucket) =>
      Object.fromEntries([
        ["bucket", Date.parse(bucket.start)],
        ...series.map((item) => [item.key, 0]),
      ]) as Record<string, number>,
  );
  const byBucket = new Map(points.map((point) => [point.bucket, point]));
  for (const row of rows) {
    const point = byBucket.get(row.bucket);
    const key = keys.get(row.value);
    if (point && key) point[key] += row.total_tokens;
  }
  return points;
}
