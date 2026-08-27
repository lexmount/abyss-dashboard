import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const applicationManifest = JSON.parse(readFileSync("package.json", "utf8")) as {
  devDependencies?: Record<string, string>;
};
const sharedManifest = JSON.parse(
  readFileSync(resolve("../../packages/ui/package.json"), "utf8"),
) as { version: string };
const sharedPrimitiveFiles = [
  "collapsible",
  "dropdown-menu",
  "loading-spinner",
  "sheet",
  "sidebar",
  "skeleton",
  "tooltip",
];

describe("shared UI workspace boundary", () => {
  it("keeps the dashboard application on the workspace package version", () => {
    expect(applicationManifest.devDependencies?.["@lexmount.com/abyss-ui"]).toBe(
      sharedManifest.version,
    );
  });

  it("does not retain package-owned primitive implementations", () => {
    for (const component of sharedPrimitiveFiles) {
      expect(existsSync(resolve("src/components/ui", `${component}.tsx`))).toBe(false);
    }
  });

  it("adapts dashboard navigation into the shared shell", () => {
    const layout = readFileSync("src/components/layouts/base-layout.tsx", "utf8");

    expect(layout).toContain("DashboardShell");
    expect(layout).toContain("sidebar={");
    expect(layout).toContain("<AppSidebar");
    expect(layout).toContain("header={<SiteHeader />}");
  });
});
