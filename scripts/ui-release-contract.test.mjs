import assert from "node:assert/strict";
import test from "node:test";

import { validateUiReleaseContract } from "./ui-release-contract.mjs";

function validManifest() {
  return {
    name: "@lexmount/abyss-ui",
    version: "0.1.0",
    publishConfig: {
      registry: "https://npm.pkg.github.com",
    },
    repository: {
      type: "git",
      url: "https://github.com/lexmount/abyss-dashboard.git",
      directory: "packages/ui",
    },
  };
}

test("accepts the GitHub Packages release contract", () => {
  assert.deepEqual(
    validateUiReleaseContract({
      manifest: validManifest(),
      npmrc: "@lexmount:registry=https://npm.pkg.github.com\n",
      releaseTag: "ui-v0.1.0",
    }),
    [],
  );
});

test("rejects registry and scope configuration drift", () => {
  const manifest = validManifest();
  manifest.publishConfig.registry = "https://registry.npmjs.org";

  assert.deepEqual(
    validateUiReleaseContract({
      manifest,
      npmrc: "registry=https://registry.npmjs.org\n",
    }),
    [
      "publish registry must be https://npm.pkg.github.com",
      ".npmrc must contain @lexmount:registry=https://npm.pkg.github.com",
    ],
  );
});

test("rejects a release tag that does not match the package version", () => {
  assert.deepEqual(
    validateUiReleaseContract({
      manifest: validManifest(),
      npmrc: "@lexmount:registry=https://npm.pkg.github.com\n",
      releaseTag: "ui-v0.2.0",
    }),
    ["release tag must be ui-v0.1.0, received ui-v0.2.0"],
  );
});
