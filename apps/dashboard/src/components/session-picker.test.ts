import { describe, expect, it } from "vitest";
import { relativeTime } from "./session-picker";

describe("relativeTime", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");

  it("reads recent activity relative to now", () => {
    expect(relativeTime("2026-09-29T11:59:40Z", "en-US", now)).toBe("now");
    expect(relativeTime("2026-09-29T11:57:00Z", "en-US", now)).toBe("3 minutes ago");
    expect(relativeTime("2026-09-29T09:00:00Z", "en-US", now)).toBe("3 hours ago");
    expect(relativeTime("2026-09-28T12:00:00Z", "en-US", now)).toBe("yesterday");
    expect(relativeTime("2026-09-29T11:57:00Z", "zh-CN", now)).toBe("3分钟前");
    expect(relativeTime("2026-09-29T11:59:40Z", "zh-CN", now)).toBe("现在");
  });

  it("falls back to a short date after a week", () => {
    expect(relativeTime("2026-09-10T08:30:00Z", "en-US", now)).toMatch(/09\/10/);
  });
});
