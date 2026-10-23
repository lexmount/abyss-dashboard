import { describe, expect, it, afterEach, vi } from "vitest";
import {
  activityBuckets,
  comparisonBuckets,
  comparisonPoints,
  comparisonSeries,
  defaultComparison,
} from "./comparison-model";

afterEach(() => vi.unstubAllEnvs());
describe("comparison time windows", () => {
  it("uses exactly 24 elapsed hourly buckets and contiguous calendar days", () => {
    const now = new Date("2026-10-23T11:34:00Z");
    const selection = defaultComparison(now);
    const hours = comparisonBuckets({ ...selection, range: "24h" }, now);
    expect(hours).toHaveLength(24);
    expect(Date.parse(hours.at(-1)!.end) - Date.parse(hours[0].start)).toBe(
      86400_000,
    );
    for (const range of ["7d", "30d"] as const) {
      const days = comparisonBuckets({ ...selection, range }, now);
      expect(days).toHaveLength(range === "7d" ? 7 : 30);
      expect(
        days.every(
          (day, index) => index === 0 || days[index - 1].end === day.start,
        ),
      ).toBe(true);
    }
    expect(activityBuckets(now)).toHaveLength(365);
  });
  it("rejects incomplete, reversed and excessively long custom ranges", () => {
    const now = new Date("2026-10-23T11:34:00Z");
    for (const [from, to] of [
      ["", ""],
      ["2026-11-01T00:00", "2026-10-01T00:00"],
      ["2020-01-01T00:00", "2026-01-01T00:00"],
    ]) {
      expect(
        comparisonBuckets(
          { ...defaultComparison(now), range: "custom", from, to },
          now,
        ),
      ).toEqual([]);
    }
  });
  it("keeps DST day boundaries contiguous", () => {
    vi.stubEnv("TZ", "America/New_York");
    const now = new Date("2026-11-03T12:00:00-05:00");
    const buckets = comparisonBuckets(
      {
        ...defaultComparison(now),
        range: "custom",
        from: "2026-10-31T00:00",
        to: "2026-11-03T00:00",
      },
      now,
    );
    expect(buckets).toHaveLength(3);
    expect(
      buckets.every(
        (bucket, index) =>
          index === 0 || buckets[index - 1].end === bucket.start,
      ),
    ).toBe(true);
    expect(buckets.at(-1)?.end).toBe(
      new Date("2026-11-03T00:00").toISOString(),
    );
  });
});
describe("comparison series", () => {
  it("fills missing buckets, sums rows and safely handles model names containing paths", () => {
    const buckets = [
      { start: "2026-10-01T00:00:00Z", end: "2026-10-02T00:00:00Z" },
      { start: "2026-10-02T00:00:00Z", end: "2026-10-03T00:00:00Z" },
    ];
    const rows = [
      {
        bucket: Date.parse(buckets[0].start),
        value: "__proto__.model",
        total_tokens: 10,
        requests: 1,
      },
      {
        bucket: Date.parse(buckets[0].start),
        value: "__proto__.model",
        total_tokens: 20,
        requests: 1,
      },
    ];
    expect(comparisonSeries(rows)[0].total).toBe(30);
    expect(
      comparisonPoints(buckets, rows).map((point) => point.series0),
    ).toEqual([30, 0]);
  });
});
