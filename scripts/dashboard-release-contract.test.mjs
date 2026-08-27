import assert from "node:assert/strict";
import test from "node:test";

import { validateDashboardReleaseContract } from "./dashboard-release-contract.mjs";

function validManifest() {
  return {
    name: "@lexmount.com/abyss-dashboard",
    version: "0.1.0",
    license: "Apache-2.0",
    private: false,
    bin: { "abyss-dashboard": "bin/abyss-dashboard.mjs" },
    files: [
      "LICENSE",
      "bin",
      "dist",
      "server/cli.mjs",
      "server/config.mjs",
      "server/http.mjs",
      "server/proxy.mjs",
      "server/server.mjs",
      "server/static.mjs",
      "README.md",
    ],
    engines: { node: ">=22.0.0" },
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org",
    },
    repository: {
      type: "git",
      url: "git+https://github.com/lexmount/abyss-dashboard.git",
      directory: "apps/dashboard",
    },
  };
}

test("accepts the public executable dashboard release contract", () => {
  assert.deepEqual(
    validateDashboardReleaseContract({
      manifest: validManifest(),
      npmrc: "registry=https://registry.npmjs.org/\n",
      releaseTag: "dashboard-v0.1.0",
    }),
    [],
  );
});

test("rejects a package with runtime dependencies or unsafe publication metadata", () => {
  const manifest = validManifest();
  manifest.private = true;
  manifest.dependencies = { express: "latest" };
  manifest.publishConfig.access = "restricted";

  assert.deepEqual(
    validateDashboardReleaseContract({
      manifest,
      npmrc: "@lexmount:registry=https://npm.pkg.github.com\n",
    }),
    [
      "dashboard package must remain publishable",
      "dashboard server must not have runtime npm dependencies",
      "publish access must be public",
      ".npmrc must use registry=https://registry.npmjs.org/ without GitHub Packages mappings",
    ],
  );
});

test("rejects a release tag that does not match the package version", () => {
  assert.deepEqual(
    validateDashboardReleaseContract({
      manifest: validManifest(),
      npmrc: "registry=https://registry.npmjs.org/\n",
      releaseTag: "dashboard-v0.2.0",
    }),
    ["release tag must be dashboard-v0.1.0, received dashboard-v0.2.0"],
  );
});
