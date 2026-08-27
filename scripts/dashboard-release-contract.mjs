const EXPECTED_PACKAGE_NAME = "@lexmount.com/abyss-dashboard";
const EXPECTED_REGISTRY = "https://registry.npmjs.org";
const EXPECTED_REPOSITORY_URL =
  "git+https://github.com/lexmount/abyss-dashboard.git";
const EXPECTED_REPOSITORY_DIRECTORY = "apps/dashboard";
const EXPECTED_REGISTRY_SETTING = "registry=https://registry.npmjs.org/";
const EXPECTED_FILES = [
  "LICENSE",
  "README.md",
  "bin",
  "dist",
  "server/cli.mjs",
  "server/config.mjs",
  "server/http.mjs",
  "server/proxy.mjs",
  "server/server.mjs",
  "server/static.mjs",
];

function hasNpmrcEntry(npmrc, expectedEntry) {
  return npmrc
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .some((line) => line === expectedEntry);
}

export function validateDashboardReleaseContract({
  manifest,
  npmrc,
  releaseTag,
}) {
  const errors = [];

  if (manifest.name !== EXPECTED_PACKAGE_NAME) {
    errors.push(`package name must be ${EXPECTED_PACKAGE_NAME}`);
  }
  if (manifest.private === true) {
    errors.push("dashboard package must remain publishable");
  }
  if (manifest.license !== "Apache-2.0") {
    errors.push("dashboard package license must be Apache-2.0");
  }
  if (manifest.bin?.["abyss-dashboard"] !== "bin/abyss-dashboard.mjs") {
    errors.push(
      "dashboard package must publish the abyss-dashboard executable",
    );
  }
  if (
    JSON.stringify([...(manifest.files ?? [])].sort()) !==
    JSON.stringify(EXPECTED_FILES)
  ) {
    errors.push(
      "dashboard package files must contain only runtime assets and server modules",
    );
  }
  if (manifest.dependencies !== undefined) {
    errors.push("dashboard server must not have runtime npm dependencies");
  }
  if (manifest.engines?.node !== ">=22.0.0") {
    errors.push("dashboard package must require Node.js 22 or newer");
  }
  if (manifest.publishConfig?.registry !== EXPECTED_REGISTRY) {
    errors.push(`publish registry must be ${EXPECTED_REGISTRY}`);
  }
  if (manifest.publishConfig?.access !== "public") {
    errors.push("publish access must be public");
  }
  if (manifest.repository?.url !== EXPECTED_REPOSITORY_URL) {
    errors.push(`repository URL must be ${EXPECTED_REPOSITORY_URL}`);
  }
  if (manifest.repository?.directory !== EXPECTED_REPOSITORY_DIRECTORY) {
    errors.push(
      `repository directory must be ${EXPECTED_REPOSITORY_DIRECTORY}`,
    );
  }
  if (
    !hasNpmrcEntry(npmrc, EXPECTED_REGISTRY_SETTING) ||
    npmrc.includes("npm.pkg.github.com")
  ) {
    errors.push(
      `.npmrc must use ${EXPECTED_REGISTRY_SETTING} without GitHub Packages mappings`,
    );
  }
  if (releaseTag !== undefined) {
    const expectedTag = `dashboard-v${manifest.version}`;
    if (releaseTag !== expectedTag) {
      errors.push(`release tag must be ${expectedTag}, received ${releaseTag}`);
    }
  }

  return errors;
}
