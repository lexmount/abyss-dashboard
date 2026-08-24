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
packages/ui/     publishable @abyss/ui design tokens and presentation components
```

`@abyss/ui` is the cross-repository style boundary. It contains visual
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

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Shared UI package

Consumers install a released `@abyss/ui` version, import its compiled component
styles once, and import the shared theme in their Tailwind entry point:

```ts
import "@abyss/ui/styles.css";
import { Button, SessionTimeline } from "@abyss/ui";
```

```css
@import "tailwindcss";
@import "@abyss/ui/theme.css";
```

Before publishing, run `npm run build -w @abyss/ui` and
`npm pack --dry-run -w @abyss/ui`. See
[`packages/ui/README.md`](packages/ui/README.md) for the package boundary.
