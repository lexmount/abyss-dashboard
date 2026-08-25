import assert from "node:assert/strict";
import test from "node:test";

import { validateUiReleaseContract } from "./ui-release-contract.mjs";

function validManifest() {
  return {
    name: "@lexmount.com/abyss-ui",
    version: "0.1.0",
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org",
    },
    repository: {
      type: "git",
      url: "git+https://github.com/lexmount/abyss-dashboard.git",
      directory: "packages/ui",
    },
  };
}

test("accepts the public npmjs release contract", () => {
  assert.deepEqual(
    validateUiReleaseContract({
      manifest: validManifest(),
      npmrc: "registry=https://registry.npmjs.org/\n",
      releaseTag: "ui-v0.1.0",
    }),
    [],
  );
});

test("rejects registry, access, and client configuration drift", () => {
  const manifest = validManifest();
  manifest.publishConfig.registry = "https://npm.pkg.github.com";
  manifest.publishConfig.access = "restricted";

  assert.deepEqual(
    validateUiReleaseContract({
      manifest,
      npmrc: "@lexmount:registry=https://npm.pkg.github.com\n",
    }),
    [
      "publish registry must be https://registry.npmjs.org",
      "publish access must be public",
      ".npmrc must use registry=https://registry.npmjs.org/ without GitHub Packages mappings",
    ],
  );
});

test("rejects a release tag that does not match the package version", () => {
  assert.deepEqual(
    validateUiReleaseContract({
      manifest: validManifest(),
      npmrc: "registry=https://registry.npmjs.org/\n",
      releaseTag: "ui-v0.2.0",
    }),
    ["release tag must be ui-v0.1.0, received ui-v0.2.0"],
  );
});
