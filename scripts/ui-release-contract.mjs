const EXPECTED_PACKAGE_NAME = "@lexmount/abyss-ui";
const EXPECTED_REGISTRY = "https://npm.pkg.github.com";
const EXPECTED_REPOSITORY_URL =
  "https://github.com/lexmount/abyss-dashboard.git";
const EXPECTED_REPOSITORY_DIRECTORY = "packages/ui";
const EXPECTED_SCOPE_MAPPING = "@lexmount:registry=https://npm.pkg.github.com";

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

  if (manifest.repository?.url !== EXPECTED_REPOSITORY_URL) {
    errors.push(`repository URL must be ${EXPECTED_REPOSITORY_URL}`);
  }

  if (manifest.repository?.directory !== EXPECTED_REPOSITORY_DIRECTORY) {
    errors.push(
      `repository directory must be ${EXPECTED_REPOSITORY_DIRECTORY}`,
    );
  }

  if (!hasNpmrcEntry(npmrc, EXPECTED_SCOPE_MAPPING)) {
    errors.push(`.npmrc must contain ${EXPECTED_SCOPE_MAPPING}`);
  }

  if (releaseTag !== undefined) {
    const expectedTag = `ui-v${manifest.version}`;
    if (releaseTag !== expectedTag) {
      errors.push(`release tag must be ${expectedTag}, received ${releaseTag}`);
    }
  }

  return errors;
}
