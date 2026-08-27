import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateDashboardReleaseContract } from "./dashboard-release-contract.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, "apps/dashboard/package.json"), "utf8"),
);
const npmrc = readFileSync(resolve(repositoryRoot, ".npmrc"), "utf8");
const [releaseTag] = process.argv.slice(2);
const errors = validateDashboardReleaseContract({
  manifest,
  npmrc,
  releaseTag,
});

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  const tagMessage = releaseTag === undefined ? "metadata" : releaseTag;
  console.log(`Dashboard release contract verified for ${tagMessage}.`);
}
