# abyss-dashboard

Open-source, privately deployable dashboard for the standalone
[`abyss-backend`](https://github.com/lexmount/abyss-backend) event service.

The dashboard displays token usage, event summaries, recent events, session
search, and complete session timelines. It intentionally does not implement
product SSO, organization administration, SaaS sharing, release management, or
Agent handoff features.

## Repository layout

```text
apps/dashboard/  Vite/React dashboard and Nginx runtime configuration
packages/ui/     publishable @lexmount.com/abyss-ui design tokens and presentation components
```

`@lexmount.com/abyss-ui` is the cross-repository style boundary. It contains visual
primitives and presentation-only domain components; API clients, routing,
authentication, query state, and product policy remain in each consuming app.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- a running `abyss-backend`
- the plaintext token matching the backend's configured bearer-token hash

## Local development

```bash
npm ci
ABYSS_DASHBOARD_DEV_API_TARGET=http://127.0.0.1:8080 \
ABYSS_DASHBOARD_DEV_API_TOKEN=replace-with-backend-token \
npm run dev
```

Open <http://127.0.0.1:5173>. Vite proxies `/api/*` to the backend, removes the
`/api` prefix, and injects the bearer token on the server side. The token is
never compiled into browser assets. Development startup fails when the token is
missing.

Session search requires the backend's optional Elasticsearch integration. The
dashboard reports the backend's `503 Service Unavailable` response when search
is not configured; usage, event, and timeline pages remain available.

## Container

Build the image from the repository root:

```bash
docker build -t abyss-dashboard .
docker run --rm -p 8081:8080 \
  -e ABYSS_DASHBOARD_API_TOKEN=replace-with-backend-token \
  -e ABYSS_DASHBOARD_BACKEND_UPSTREAM=host.docker.internal:8080 \
  abyss-dashboard
```

Runtime variables:

| Variable                           | Required | Default | Purpose                                                 |
| ---------------------------------- | -------- | ------- | ------------------------------------------------------- |
| `ABYSS_DASHBOARD_API_TOKEN`        | yes      | none    | Server-side bearer token injected into backend requests |
| `ABYSS_DASHBOARD_BACKEND_UPSTREAM` | yes      | none    | Backend `host:port` used by Nginx                       |
| `ABYSS_DASHBOARD_BACKEND_SCHEME`   | no       | `http`  | Backend scheme (`http` or `https`)                      |
| `NGINX_PORT`                       | no       | `8080`  | Dashboard listen port inside the container              |

The container refuses to start when either required value is absent. Do not put
the API token in a `VITE_*` variable: Vite exposes those values to browser
JavaScript. Container tokens must use the standard RFC 6750 bearer-token
character set because Nginx injects the value into its generated configuration.

## Native npm package

The dashboard is also published as a native Node.js executable for local
deployments that do not use Docker. The package includes the production browser
assets and a zero-dependency HTTP server that securely proxies `/api` requests
to `abyss-backend`:

```bash
install -m 0600 /dev/null "$HOME/.abyss/backend.token"
printf '%s\n' "$ABYSS_API_TOKEN" > "$HOME/.abyss/backend.token"

npx --yes @lexmount.com/abyss-dashboard@0.1.0 \
  --backend http://127.0.0.1:8080 \
  --token-file "$HOME/.abyss/backend.token"
```

Open <http://127.0.0.1:5173>. The server binds only to IPv4 loopback by
default. Run the package with `--help` to see the supported flags and
environment variables.

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Shared UI package

Consumers install a released `@lexmount.com/abyss-ui` version from the public
npm registry, import its compiled component styles once, and import the shared
theme in their Tailwind entry point:

```ts
import "@lexmount.com/abyss-ui/styles.css";
import { Button, SessionTimeline } from "@lexmount.com/abyss-ui";
```

```css
@import "tailwindcss";
@import "@lexmount.com/abyss-ui/theme.css";
```

The package is published by `.github/workflows/publish-ui.yml` when a GitHub
Release is published with a tag such as `ui-v0.1.0`. The tag must match the
version in `packages/ui/package.json`; published versions are immutable. The
workflow authenticates to npmjs with OIDC Trusted Publishing, so the repository
does not store a long-lived npm publish token.

Before creating a release, run:

```bash
npm run check:ui-release -- ui-v0.1.0
npm pack --dry-run -w @lexmount.com/abyss-ui
```

See [`packages/ui/README.md`](packages/ui/README.md) for the component boundary,
release authentication, and consumer CI configuration.

## Dashboard package releases

The executable dashboard package is released independently from the shared UI
package. Publish a GitHub Release with a `dashboard-v0.1.0`-style tag matching
the version in `apps/dashboard/package.json`. The
`.github/workflows/publish-dashboard.yml` workflow verifies the complete packed
artifact and publishes it to npmjs with OIDC Trusted Publishing and provenance.

Before creating a dashboard release, run:

```bash
npm run check:dashboard-release -- dashboard-v0.1.0
npm pack --dry-run -w @lexmount.com/abyss-dashboard
```
