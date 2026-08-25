import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard style entry", () => {
  it("loads shared UI styles before application Tailwind utilities", () => {
    const mainSource = readFileSync(resolve("src/main.tsx"), "utf8");
    const styleSource = readFileSync(resolve("src/index.css"), "utf8");

    expect(mainSource).not.toContain("@abyss/ui/styles.css");
    expect(
      styleSource.indexOf('@import "@abyss/ui/styles.css";'),
    ).toBeGreaterThanOrEqual(0);
    expect(styleSource.indexOf('@import "@abyss/ui/styles.css";')).toBeLessThan(
      styleSource.indexOf('@import "tailwindcss";'),
    );
    expect(styleSource).toContain(".dashboard-sidebar-desktop");
    expect(styleSource).toContain(".dashboard-sidebar-container");
    expect(styleSource).toContain(".dashboard-filter-grid");
    expect(styleSource).toContain("repeat(7, minmax(0, 1fr))");
    expect(styleSource).toContain(".session-search-filter-grid");
    expect(styleSource).toContain("repeat(6, minmax(0, 1fr))");
    expect(styleSource).toContain(".session-search-query-input");
    expect(styleSource).toContain("padding-left: 2.25rem !important");
  });
});
