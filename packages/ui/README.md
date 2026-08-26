# @lexmount.com/abyss-ui

Shared design tokens and presentation-only React components for Abyss web
applications.

## Boundary

The package may own:

- colors, typography, spacing, radii, dark-mode tokens, and base styles;
- reusable visual primitives;
- reusable application shells such as the dashboard header, responsive sidebar,
  and page-title layout;
- presentation-only domain views such as `SessionTimeline`; and
- accessibility and interaction behavior local to those components.

It must not own API clients, authentication, routing, TanStack Query state,
deployment configuration, or product authorization policy. Domain views receive
formatters, translated labels, URLs, and callbacks from their host application.

## Use

```ts
import "@lexmount.com/abyss-ui/styles.css";
import { Button, DashboardShell } from "@lexmount.com/abyss-ui";
```

Applications provide product-owned content to shared shells. In particular,
navigation routes, permission checks, account actions, translated copy, and API
state remain in the consuming application.

Only primitives used by an Abyss application belong in this package. Remove
unused generated component scaffolds from applications; when a product starts
using a new primitive, add and test its canonical implementation here before
consuming it from either application.

Tailwind-based consumers should also import the shared theme before declaring
application-specific styles:

```css
@import "tailwindcss";
@import "@lexmount.com/abyss-ui/theme.css";
```

The component stylesheet is precompiled, so consuming applications do not need
to scan this package's source files for Tailwind class names.

## Release

The package is published publicly under the `lexmount.com` npm organization at
<https://www.npmjs.com/package/@lexmount.com/abyss-ui>. Consumers do not need
registry credentials.

Update this package's semantic version, then verify the release locally:

```bash
npm run build -w @lexmount.com/abyss-ui
npm test -w @lexmount.com/abyss-ui
npm pack --dry-run -w @lexmount.com/abyss-ui
npm run check:ui-release -- ui-v0.2.0
```

Publish a GitHub Release whose tag is `ui-v<version>`. The
`publish-ui.yml` workflow validates the repository, runs all quality checks, and
publishes through npm Trusted Publishing with a short-lived GitHub Actions OIDC
credential. Do not add an npm publish token to the repository. npm package
versions are immutable, so increment the version for every release.

`abyss-dashboard` consumes the workspace version during development;
`abyss-frontend` should pin an explicitly released version so the repositories
can deploy independently.

## Consumer CI

Because the package is public on npmjs, consuming GitHub Actions workflows need
no npm credentials:

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v6
    with:
      node-version: 24
      registry-url: https://registry.npmjs.org
      cache: npm
  - run: npm ci
```
