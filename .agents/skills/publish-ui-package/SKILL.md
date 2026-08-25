---
name: publish-ui-package
description: Publish @lexmount/abyss-ui from abyss-dashboard to GitHub Packages by preparing its version, validating the package, creating the GitHub Release, monitoring Actions, and verifying the immutable package version. Use for shared UI package releases, not dashboard deployment or npmjs publication.
---

# Publish the Abyss UI Package

Release `packages/ui` through `.github/workflows/publish-ui.yml`. A published
GitHub Release named `ui-v<version>` triggers the workflow, which publishes
`@lexmount/abyss-ui` to `https://npm.pkg.github.com`.

## Release invariants

- Release only a commit contained in the latest remote `main`.
- The tag must be exactly `ui-v<packages/ui/package.json version>`.
- Keep `apps/dashboard` pinned to that exact UI package version and regenerate
  `package-lock.json` with both manifests.
- Never move or force-update a release tag and never delete a package version
  to reuse its version number. Publish a new version for corrections.
- Never print, commit, or request a shared package token. The publishing
  workflow uses its repository `GITHUB_TOKEN`.
- Stop on a dirty worktree, divergent `main`, failed required check, missing
  GitHub permission, or ambiguous package-version lookup. Do not stash or
  discard user changes.
- Show the release tag and target commit, then obtain confirmation immediately
  before creating the GitHub Release. That action creates the tag and starts
  external publication.

## Determine the release

Require a target semantic version. Accept `0.2.0`, `v0.2.0`, or `ui-v0.2.0`
and normalize them to package version `0.2.0` and tag `ui-v0.2.0`. Preserve
valid npm prerelease suffixes such as `0.2.0-beta.1`. Ask for the version when
the user did not provide one and did not explicitly request the current
version.

Read the repository contract before changing anything:

```bash
git status --short --branch
git fetch origin main --tags
gh auth status
git switch main
git pull --ff-only origin main
git status --short --branch
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
node -p 'require("./packages/ui/package.json").version'
node -p 'require("./apps/dashboard/package.json").dependencies["@lexmount/abyss-ui"]'
node -p 'require("./package-lock.json").packages["packages/ui"].version'
node -p 'require("./package-lock.json").packages["apps/dashboard"].dependencies["@lexmount/abyss-ui"]'
```

The worktree must be clean, `main` must exactly track `origin/main`, and
`.github/workflows/publish-ui.yml` must exist on `main`. If local `main` has
diverged, stop and report it instead of resetting. Before preparing a version
change, all four printed versions must equal one another; they do not yet need
to equal the requested version. After the version pull request merges, all four
must equal the normalized target version. If the publishing infrastructure
exists only in an open pull request, stop and report that prerequisite; do not
publish from or silently merge the feature branch.

Prove that the current GitHub identity can write releases and read package
metadata before interpreting absence checks:

```bash
gh api repos/lexmount/abyss-dashboard \
  --jq '{push: .permissions.push, maintain: .permissions.maintain, admin: .permissions.admin}'
gh api user/memberships/orgs/lexmount --jq '{state: .state, role: .role}'
gh api --paginate \
  '/orgs/lexmount/packages?package_type=npm&per_page=100' \
  --jq '.[].name'
```

Require `push`, `maintain`, or `admin` repository permission. The package-list
request must complete successfully; an authentication, authorization, network,
or parsing failure is a blocker. Record whether the active organization
membership role is `admin`, which is GitHub's API role for an organization
owner.

Check that neither the tag nor release already exists:

```bash
git ls-remote --tags origin "refs/tags/ui-v0.2.0"
git tag -l 'ui-v0.2.0'
gh api repos/lexmount/abyss-dashboard/releases/tags/ui-v0.2.0
```

The remote and local tag queries must be empty. After repository access has
been proven, only an explicit API `404` means the release is absent.

If the successful organization package listing contains `abyss-ui`, inspect
every version page:

```bash
gh api --paginate \
  '/orgs/lexmount/packages/npm/abyss-ui/versions?per_page=100' \
  --jq '.[].name'
```

If the successful listing does not contain `abyss-ui`, treat this as the first
package release only when the active Lexmount organization membership role is
`admin`; organization owners receive admin access to organization packages. A
non-owner's successful listing contains only packages readable by that user, so
absence remains ambiguous and requires owner verification. Never interpret a
package endpoint `404` by itself as proof that the package is absent. Stop if
the target version is already present.

## Prepare a version change

Skip this section when the requested version is already consistent in both
manifests and the lockfile on `main`.

Otherwise create `release/ui-v<version>-version` from the synchronized `main`.
Update only:

- `packages/ui/package.json` `version`;
- `apps/dashboard/package.json` dependency `@lexmount/abyss-ui` to the same
  exact version; and
- the corresponding `package-lock.json` entries, regenerated with:

```bash
npm install --package-lock-only --ignore-scripts
```

Run the complete release gate from the repository root:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run check:ui-release -- ui-v0.2.0
npm pack --dry-run -w @lexmount/abyss-ui
docker build -t abyss-dashboard:ui-release-check .
git diff --check
```

Inspect the tarball listing and reject credentials, local configuration,
application API code, or files outside the package's documented boundary.

Commit and push the version branch, open a pull request against `main`, and
wait for all required checks. Use the repository's normal merge strategy and
do not bypass approvals or branch protection. If the pull request cannot be
merged normally, stop. After it merges, synchronize `main` again and repeat the
manifest, contract, tag, and package-version checks.

## Publish

Record the exact release target:

```bash
release_tag='ui-v0.2.0'
release_version='0.2.0'
release_commit="$(git rev-parse origin/main)"
git log -1 --oneline "$release_commit"
npm run check:ui-release -- "$release_tag"
```

Repeat the remote tag, release, and package-version absence checks immediately
before confirmation. Show the user `release_tag`, `release_version`, and
`release_commit`. After the user confirms, create and push an annotated tag at
that exact commit without force:

```bash
git tag -a "$release_tag" "$release_commit" \
  -m "Release @lexmount/abyss-ui ${release_version}"
git push origin "refs/tags/${release_tag}"
remote_tag_commit="$(git ls-remote origin "refs/tags/${release_tag}^{}" | cut -f1)"
test "$remote_tag_commit" = "$release_commit"
```

The push must fail rather than overwrite an existing tag. Verify the peeled
remote tag SHA equals `release_commit`, then create the release from that
already-pushed tag:

```bash
gh release create "$release_tag" \
  --repo lexmount/abyss-dashboard \
  --verify-tag \
  --title "$release_tag" \
  --notes-from-tag
```

Add `--prerelease` when the npm version is a prerelease. Do not create a draft:
the workflow listens for the `published` release event. If release creation
fails after the tag push, never delete or move the tag; resolve the error,
reconfirm its exact remote SHA and package-version absence, then retry only the
release creation.

## Monitor and verify

Find the `publish-ui.yml` run associated with the release tag and watch it to
completion:

```bash
gh run list \
  --repo lexmount/abyss-dashboard \
  --workflow publish-ui.yml \
  --event release \
  --commit "$release_commit" \
  --limit 20 \
  --json databaseId,headBranch,headSha,status,conclusion,url
gh run watch <run-id> --repo lexmount/abyss-dashboard --exit-status
```

Poll until a run appears whose `headBranch` is `release_tag` and whose
`headSha` is `release_commit`; do not select a run merely because it is recent.
If no matching run appears within five minutes, stop and report the missing
release event instead of watching an unrelated run.

If the workflow fails, inspect `gh run view <run-id> --log-failed`. Before any
rerun, query GitHub Packages again: a timed-out publish may still have created
the immutable version. Do not delete it or blindly rerun `npm publish`.

After success, verify all of the following:

- `gh release view <tag>` reports a published, non-draft release at the
  intended commit;
- the Actions run completed successfully;
- the GitHub Packages versions API contains the exact npm version; and
- the package metadata links to `lexmount/abyss-dashboard`.

For the first package release, report that an organization package
administrator must grant `lexmount/abyss-frontend` **Read** access under
**Package settings → Manage Actions access**. GitHub does not expose this
granular Actions-access list through the package REST endpoints used above. If
it cannot be verified from the package settings page with the available signed-
in browser session, report the access status as **unknown—administrator
verification required**. Do not infer it from repository visibility or mutate
package permissions without explicit authorization.

## Final report

Report the npm version, release tag, commit SHA, GitHub Release URL, Actions run
URL and result, GitHub Package URL, and whether `abyss-frontend` Actions access
still requires configuration. Never include token values.
