# @abyss/ui

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
import "@abyss/ui/styles.css";
import { Button } from "@abyss/ui";
```

Tailwind-based consumers should also import the shared theme before declaring
application-specific styles:

```css
@import "tailwindcss";
@import "@abyss/ui/theme.css";
```

The component stylesheet is precompiled, so consuming applications do not need
to scan this package's source files for Tailwind class names.

## Release

```bash
npm run build -w @abyss/ui
npm test -w @abyss/ui
npm pack --dry-run -w @abyss/ui
npm publish -w @abyss/ui
```

Use semantic versions. `abyss-dashboard` consumes the workspace version during
development; `abyss-frontend` should consume an explicitly released version so
the two repositories can deploy independently.
