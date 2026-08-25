# Repository guidance

This repository contains the standalone Abyss dashboard and the shared
`@lexmount/abyss-ui` package.

## Ownership

- `apps/dashboard` owns backend API calls, routes, query state, deployment, and
  standalone-dashboard behavior.
- `packages/ui` owns shared design tokens, primitives, and presentation-only
  components.
- Do not add SSO, organization administration, SaaS sharing, release
  management, or Agent handoff behavior to the standalone dashboard.
- Do not add API, authentication, routing, TanStack Query, or deployment
  dependencies to `@lexmount/abyss-ui`. Inject labels, formatters, URLs, and
  callbacks.

## Verification

Run formatting, linting, type checks, unit tests, production builds, and the
container build for changes that affect their corresponding surfaces.
