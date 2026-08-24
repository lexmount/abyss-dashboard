import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard nginx config", () => {
  const config = readFileSync("nginx.conf.template", "utf8");

  it("serves the React router fallback for non-API routes", () => {
    expect(config).toContain("try_files $uri $uri/ /index.html;");
  });

  it("proxies API requests to the backend upstream", () => {
    expect(config).toContain("location /api/");
    expect(config).toContain(
      "proxy_pass ${ABYSS_DASHBOARD_BACKEND_SCHEME}://${ABYSS_DASHBOARD_BACKEND_UPSTREAM}/;",
    );
  });

  it("injects the server-side bearer token for every proxied API request", () => {
    expect(config).toContain(
      'proxy_set_header Authorization "Bearer ${ABYSS_DASHBOARD_API_TOKEN}";',
    );
  });
});
