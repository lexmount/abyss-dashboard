---
name: publish-ui-package
description: Publish @lexmount.com/abyss-ui from abyss-dashboard to the public npm registry by preparing its version, validating the package, creating a GitHub Release, monitoring the OIDC publishing workflow, and verifying the immutable npm version. Use for shared UI releases, not dashboard deployment.
---

# Publish the Abyss UI Package

Release `packages/ui` to npmjs through `.github/workflows/publish-ui.yml`. A
published GitHub Release named `ui-v<version>` triggers GitHub Actions, which
publishes `@lexmount.com/abyss-ui` with npm Trusted Publishing (OIDC).

## Invariants

- Release only a commit contained in the latest remote `main`.
- Use the exact tag `ui-v<packages/ui/package.json version>`.
- Keep `apps/dashboard` pinned to that exact UI version and regenerate
  `package-lock.json` whenever the package name or version changes.
- Keep the package public and its registry set to `https://registry.npmjs.org`.
- Never move a release tag or reuse a published npm version.
- Never create, request, print, or store a long-lived npm publish token. The
  workflow authenticates with OIDC and must retain `id-token: write`.
- Stop on a dirty worktree, divergent `main`, failed required check, missing
  repository permission, or ambiguous package metadata. Do not stash or discard
  user changes.
- Obtain confirmation immediately before an external publish, tag push, or
  GitHub Release creation unless the user already explicitly authorized that
  exact release and target.

## Preflight

Require a semantic version. Accept `0.2.0`, `v0.2.0`, or `ui-v0.2.0` and
normalize them to version `0.2.0` and tag `ui-v0.2.0`. Preserve valid npm
prerelease suffixes.

Synchronize and inspect the repository without overwriting local work:

```bash
git status --short --branch
git fetch origin main --tags
gh auth status
git switch main
git pull --ff-only origin main
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
node -p 'require("./packages/ui/package.json").version'
node -p 'require("./apps/dashboard/package.json").dependencies["@lexmount.com/abyss-ui"]'
node -p 'require("./package-lock.json").packages["packages/ui"].version'
node -p 'require("./package-lock.json").packages["apps/dashboard"].dependencies["@lexmount.com/abyss-ui"]'
```

Require a clean worktree, exact `main` synchronization, and matching manifest
and lockfile versions. Confirm repository write access:

```bash
gh repo view lexmount/abyss-dashboard \
  --json nameWithOwner,viewerPermission,defaultBranchRef,url
```

## Verify an established package and OIDC publishing

Established package releases do not require a locally authenticated npm
session. Do not run `npm whoami`, `npm team`, or `npm profile` as a release
precondition, and never request a local npm token for CI publishing.

Query the public npm metadata explicitly so a user-level registry override
cannot redirect the check:

```bash
npm view '@lexmount.com/abyss-ui' versions repository --json \
  --registry=https://registry.npmjs.org/
```

Verify `.github/workflows/publish-ui.yml` still uses a GitHub-hosted runner,
Node 22.14 or newer, npm 11.5.1 or newer, and `permissions.id-token: write`.
It must publish with `npm publish -w @lexmount.com/abyss-ui --access public`
and must not read a long-lived npm token.

For an existing package, use the latest successful release-triggered
`publish-ui.yml` run as evidence that npm Trusted Publishing authorizes the
repository and workflow:

```bash
gh run list \
  --repo lexmount/abyss-dashboard \
  --workflow publish-ui.yml \
  --event release \
  --status success \
  --limit 1 \
  --json databaseId,headBranch,headSha,status,conclusion,url
```

Require a successful run for a published `ui-v*` tag. If no such run exists,
treat the package as an initial or unproven setup and use the bootstrap flow
below. A later OIDC configuration regression is surfaced by the release job;
diagnose that job rather than falling back to a local token publish.

## Bootstrap a new npm package

Trusted Publishing can be configured only after the package exists. For the
first npmjs version, authenticate a maintainer locally, run the complete release
gate, inspect the tarball, show the user the package name and version, and
publish locally:

```bash
npm publish -w @lexmount.com/abyss-ui \
  --access public \
  --registry=https://registry.npmjs.org/
```

Complete the interactive 2FA challenge. Verify the exact version with
`npm view`, then configure the Trusted Publisher fields above before relying on
CI. This bootstrap is the only local-publish exception; all later versions go
through the release workflow.

## Prepare a version change

Skip the version change when all manifests and lockfile entries already equal
the requested version. Otherwise create `release/ui-v<version>-version` from
synchronized `main`, then update:

- `packages/ui/package.json` `version`;
- `apps/dashboard/package.json` dependency `@lexmount.com/abyss-ui`; and
- the corresponding `package-lock.json` entries.

Regenerate the lockfile with:

```bash
npm install --package-lock-only --ignore-scripts
```

Run the complete release gate:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run check:ui-release -- ui-v0.2.0
npm pack --dry-run -w @lexmount.com/abyss-ui
docker build -t abyss-dashboard:ui-release-check .
git diff --check
```

Reject credentials, local configuration, application API code, or files outside
the package boundary in the tarball listing. Commit and push the version branch,
open a pull request against `main`, and wait for required checks. Do not bypass
branch protection. After merge, synchronize `main` and repeat the manifest,
contract, tag, Trusted Publisher, and target-version checks.

## Publish through CI

Check that the tag, GitHub Release, and npm version do not already exist:

```bash
git ls-remote --tags origin "refs/tags/ui-v0.2.0"
git tag -l 'ui-v0.2.0'
gh api repos/lexmount/abyss-dashboard/releases/tags/ui-v0.2.0
npm view '@lexmount.com/abyss-ui@0.2.0' version \
  --registry=https://registry.npmjs.org/
```

Only explicit not-found results count as absence after the public package
metadata query succeeds. Show the normalized tag, version, and exact
`origin/main` commit. After the required confirmation, create an annotated tag
at that commit, push it without force, verify the peeled remote SHA, and create
the release:

```bash
git tag -a ui-v0.2.0 <release-commit> \
  -m "Release @lexmount.com/abyss-ui 0.2.0"
git push origin refs/tags/ui-v0.2.0
gh release create ui-v0.2.0 \
  --repo lexmount/abyss-dashboard \
  --verify-tag \
  --title ui-v0.2.0 \
  --notes-from-tag
```

Add `--prerelease` for prerelease versions. If release creation fails after the
tag push, never delete or move the tag; verify its target and retry only release
creation.

## Monitor and verify

Find the release-triggered run whose `headBranch` is the release tag and whose
`headSha` is the release commit:

```bash
gh run list \
  --repo lexmount/abyss-dashboard \
  --workflow publish-ui.yml \
  --event release \
  --commit <release-commit> \
  --limit 20 \
  --json databaseId,headBranch,headSha,status,conclusion,url
gh run watch <run-id> --repo lexmount/abyss-dashboard --exit-status
```

If no matching run appears within five minutes, stop rather than watching an
unrelated run. On failure, inspect `gh run view <run-id> --log-failed` and query
npm before rerunning because a timed-out job may still have published the
immutable version.

After success, verify the GitHub Release, Actions conclusion, exact npm version,
public access, and repository metadata:

```bash
npm view '@lexmount.com/abyss-ui@0.2.0' \
  name version dist-tags repository --json \
  --registry=https://registry.npmjs.org/
```

Report the version, tag, commit SHA, GitHub Release URL, Actions URL and result,
and npm package URL. Never include credentials or one-time codes.
