import { describe, expect, it } from "vitest";
import { createTimeRange, resolveTimeRange } from "./time-range";

describe("resolveTimeRange", () => {
  const now = new Date(2026, 8, 27, 21, 45, 30);

  it("leaves both bounds open for any time", () => {
    expect(resolveTimeRange(createTimeRange("any", now), now)).toEqual({});
  });

  it("resolves relative presets back from the current minute", () => {
    const { from, to } = resolveTimeRange(createTimeRange("24h", now), now);

    expect(to).toBe(new Date(2026, 8, 27, 21, 45).toISOString());
    expect(from).toBe(new Date(2026, 8, 26, 21, 45).toISOString());
  });

  it("uses minute-precision local bounds for a custom range", () => {
    expect(
      resolveTimeRange(
        { preset: "custom", from: "2026-09-01T08:30", to: "2026-09-07T18:05" },
        now,
      ),
    ).toEqual({
      from: new Date(2026, 8, 1, 8, 30).toISOString(),
      to: new Date(2026, 8, 7, 18, 5).toISOString(),
    });
  });

  it("ignores an incomplete custom bound", () => {
    expect(
      resolveTimeRange({ preset: "custom", from: "", to: "2026-09-07T18:05" }, now),
    ).toEqual({ from: undefined, to: new Date(2026, 8, 7, 18, 5).toISOString() });
  });

  it("prefills custom bounds with the last seven days", () => {
    expect(createTimeRange("custom", now)).toMatchObject({
      from: "2026-09-20T21:45",
      to: "2026-09-27T21:45",
    });
  });
});
