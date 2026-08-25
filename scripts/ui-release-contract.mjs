const EXPECTED_PACKAGE_NAME = "@lexmount.com/abyss-ui";
const EXPECTED_REGISTRY = "https://registry.npmjs.org";
const EXPECTED_REPOSITORY_URL =
  "git+https://github.com/lexmount/abyss-dashboard.git";
const EXPECTED_REPOSITORY_DIRECTORY = "packages/ui";
const EXPECTED_REGISTRY_SETTING = "registry=https://registry.npmjs.org/";

function hasNpmrcEntry(npmrc, expectedEntry) {
  return npmrc
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .some((line) => line === expectedEntry);
}

export function validateUiReleaseContract({ manifest, npmrc, releaseTag }) {
  const errors = [];

  if (manifest.name !== EXPECTED_PACKAGE_NAME) {
    errors.push(`package name must be ${EXPECTED_PACKAGE_NAME}`);
  }

  if (manifest.private === true) {
    errors.push("UI package must remain publishable");
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
    const expectedTag = `ui-v${manifest.version}`;
    if (releaseTag !== expectedTag) {
      errors.push(`release tag must be ${expectedTag}, received ${releaseTag}`);
    }
  }

  return errors;
}
