# @lexmount/abyss-ui

Shared design tokens and presentation-only React components for Abyss web
applications.

## Boundary

The package may own:

- colors, typography, spacing, radii, dark-mode tokens, and base styles;
- reusable visual primitives;
- presentation-only domain views such as `SessionTimeline`; and
- accessibility and interaction behavior local to those components.

It must not own API clients, authentication, routing, TanStack Query state,
deployment configuration, or product authorization policy. Domain views receive
formatters, translated labels, URLs, and callbacks from their host application.

## Use

```ts
import "@lexmount/abyss-ui/styles.css";
import { Button } from "@lexmount/abyss-ui";
```

Tailwind-based consumers should also import the shared theme before declaring
application-specific styles:

```css
@import "tailwindcss";
@import "@lexmount/abyss-ui/theme.css";
```

The component stylesheet is precompiled, so consuming applications do not need
to scan this package's source files for Tailwind class names.

## Release

The package is hosted by the Lexmount organization at
`https://npm.pkg.github.com`. Repository `.npmrc` maps only the `@lexmount`
scope, so public dependencies continue to resolve from npmjs.org.

Update this package's semantic version, then verify the release locally:

```bash
npm run build -w @lexmount/abyss-ui
npm test -w @lexmount/abyss-ui
npm pack --dry-run -w @lexmount/abyss-ui
npm run check:ui-release -- ui-v0.1.0
```

Publish a GitHub Release whose tag is `ui-v<version>`. The
`publish-ui.yml` workflow validates the repository, runs all quality checks, and
publishes with its short-lived `GITHUB_TOKEN`. Do not add a package token to the
repository. GitHub Package versions are immutable, so increment the version for
every release.

`abyss-dashboard` consumes the workspace version during development;
`abyss-frontend` should pin an explicitly released version so the repositories
can deploy independently.

## Consumer authentication

Consumers commit this registry mapping without credentials:

```ini
@lexmount:registry=https://npm.pkg.github.com
```

For local development, create a classic GitHub personal access token with
`read:packages`, authorize it for organization SSO when required, and sign in:

```bash
npm login \
  --scope=@lexmount \
  --auth-type=legacy \
  --registry=https://npm.pkg.github.com
```

Each consuming GitHub Actions workflow uses its repository `GITHUB_TOKEN`:

```yaml
permissions:
  contents: read
  packages: read

steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 22
      registry-url: https://npm.pkg.github.com
      scope: "@lexmount"
      cache: npm
  - run: npm ci
    env:
      NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

After the first publish, a package administrator must grant each consuming
repository read access under the package's **Manage Actions access** settings.
