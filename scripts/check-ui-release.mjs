import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateUiReleaseContract } from "./ui-release-contract.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, "packages/ui/package.json"), "utf8"),
);
const npmrc = readFileSync(resolve(repositoryRoot, ".npmrc"), "utf8");
const [releaseTag] = process.argv.slice(2);
const errors = validateUiReleaseContract({ manifest, npmrc, releaseTag });

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  const tagMessage = releaseTag === undefined ? "metadata" : releaseTag;
  console.log(`UI release contract verified for ${tagMessage}.`);
}
