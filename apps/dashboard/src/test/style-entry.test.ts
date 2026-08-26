import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard style entry", () => {
  it("loads shared UI styles without duplicating package-owned layout rules", () => {
    const mainSource = readFileSync(resolve("src/main.tsx"), "utf8");
    const styleSource = readFileSync(resolve("src/index.css"), "utf8");

    expect(mainSource).not.toContain("@lexmount.com/abyss-ui/styles.css");
    expect(
      styleSource.indexOf('@import "@lexmount.com/abyss-ui/styles.css";'),
    ).toBeGreaterThanOrEqual(0);
    expect(
      styleSource.indexOf('@import "@lexmount.com/abyss-ui/styles.css";'),
    ).toBeLessThan(styleSource.indexOf('@import "tailwindcss";'));
    expect(styleSource).not.toContain(".dashboard-sidebar-desktop");
    expect(styleSource).not.toContain(".dashboard-filter-grid");
    expect(styleSource).not.toContain(".session-search-filter-grid");
    expect(styleSource).not.toContain(".session-search-query-input");
  });
});
