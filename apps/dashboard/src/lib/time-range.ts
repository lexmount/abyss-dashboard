export const timeRangePresets = ["any", "24h", "7d", "30d", "custom"] as const;

export type TimeRangePreset = (typeof timeRangePresets)[number];

export interface TimeRange {
  preset: TimeRangePreset;
  /** Local date-time (YYYY-MM-DDTHH:mm), used only by the custom preset. */
  from: string;
  /** Local date-time (YYYY-MM-DDTHH:mm), used only by the custom preset. */
  to: string;
}

export interface ResolvedTimeRange {
  from?: string;
  to?: string;
}

const presetHours: Partial<Record<TimeRangePreset, number>> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

const presetDays: Partial<Record<TimeRangePreset, number>> = {
  "7d": 7,
  "30d": 30,
};

/**
 * How day presets count: `rolling` goes back exactly 24 hours per day, while
 * `calendar` counts today as the latest day, so "last 7 days" starts at local
 * midnight six days ago and only spans full days once today is over.
 */
export type DayCounting = "rolling" | "calendar";

export function isTimeRangePreset(value: string | null): value is TimeRangePreset {
  return timeRangePresets.includes(value as TimeRangePreset);
}

/** Creates a range whose custom bounds default to the last seven days. */
export function createTimeRange(
  preset: TimeRangePreset,
  now: Date = new Date(),
): TimeRange {
  const to = new Date(now);
  to.setSeconds(0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return {
    preset,
    from: toDateTimeLocalInputValue(from),
    to: toDateTimeLocalInputValue(to),
  };
}

/** Converts a time range into backend UTC bounds. */
export function resolveTimeRange(
  range: TimeRange,
  now: Date = new Date(),
  dayCounting: DayCounting = "rolling",
): ResolvedTimeRange {
  const days = presetDays[range.preset];
  if (dayCounting === "calendar" && days !== undefined) {
    const to = new Date(now);
    to.setSeconds(0, 0);
    const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1));
    return { from: from.toISOString(), to: to.toISOString() };
  }
  const hours = presetHours[range.preset];
  if (hours !== undefined) {
    const to = new Date(now);
    to.setSeconds(0, 0);
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (range.preset !== "custom") {
    return {};
  }
  return { from: localDateTimeToIso(range.from), to: localDateTimeToIso(range.to) };
}

export function toDateTimeLocalInputValue(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-") +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function localDateTimeToIso(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
