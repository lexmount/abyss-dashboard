import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared application layout styles", () => {
  it("owns the responsive sidebar, filters, search input, and chart rules", () => {
    const styleSource = readFileSync(resolve("src/styles.css"), "utf8");

    expect(styleSource).toContain(".dashboard-sidebar-desktop");
    expect(styleSource).toContain(".dashboard-sidebar-container");
    expect(styleSource).toContain(".dashboard-filter-grid");
    expect(styleSource).toContain("repeat(7, minmax(0, 1fr))");
    expect(styleSource).toContain(".session-search-filter-grid");
    expect(styleSource).toContain("repeat(6, minmax(0, 1fr))");
    expect(styleSource).toContain("@media (min-width: 80rem)");
    expect(styleSource).not.toContain("@media (min-width: 1024px)");
    expect(styleSource).toContain(".session-search-query-input");
    expect(styleSource).toContain("padding-left: 2.25rem !important");
    expect(styleSource).toContain('data-slot="input"');
    expect(styleSource).toContain('[type="datetime-local"]');
    expect(styleSource).toContain("::-webkit-calendar-picker-indicator");
    expect(styleSource).toContain("inset-inline-end: 1.25rem");
    expect(styleSource).toContain(".sidebar-none-mode");
    expect(styleSource).toContain(".recharts-no-focus");
    expect(styleSource).toContain(".mode-toggle-button");
    expect(styleSource).toContain("::view-transition-new(root)");
  });
});
