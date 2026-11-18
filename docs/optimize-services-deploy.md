# Frontend publishing architecture: standalone assessment

Task: `optimize-services-deploy.md`.

The user confirmed AMD64 Kubernetes clusters and requested AMD64-only product
frontend and service images. This assessment covers the standalone dashboard
at baseline `56fc239726e2cc5b0495f24fb9b04b7444cadd3e` and coordinates with the
[product frontend design](https://github.com/lexmount/abyss-frontend/blob/task/optimize-services-deploy/docs/optimize-services-deploy.md).
The [service diagnosis](https://github.com/lexmount/abyss-services/pull/33)
records the original build and registry evidence.

This repository publishes the dashboard application and shared presentation
package to npm through `publish-dashboard.yml` and `publish-ui.yml`. Neither
workflow builds or publishes a multi-platform container. CI builds the Dockerfile
on its native Ubuntu runner to validate server-side backend routing and token
injection. There is no ARM64 publication input to remove here.

Keep the npm release workflow, package contracts, application behavior, and
presentation-only shared UI ownership unchanged. The product frontend's server
container architecture does not change its browser component API, and requires
no package release or synchronization of authentication into this application.
A source-built dashboard container can still target the platform chosen by its
operator; this PR does not introduce a new platform restriction for that path.

Run repository formatting, linting, type checks, unit/package black-box tests,
production builds, release contract checks, and a container build. The task
keeps the actual standalone backend and dashboard available with synthetic data
alongside the product stack. Its persistent Chinese HTML report is located at
`artifacts/optimize-services-deploy/` in the coordinator workspace and records
the final revisions and review evidence.

The companion product PRs can merge independently of this documentation. No
API change, migration, shared package version bump, or release ordering is
required. Reverting this assessment does not affect runtime artifacts.

## Coordinated PR set

- [abyss-services #33](https://github.com/lexmount/abyss-services/pull/33) and [design](https://github.com/lexmount/abyss-services/blob/task/optimize-services-deploy/docs/optimize-services-deploy.md).
- [abyss-backend #23](https://github.com/lexmount/abyss-backend/pull/23) and [design](https://github.com/lexmount/abyss-backend/blob/task/optimize-services-deploy/docs/optimize-services-deploy.md).
- [abyss-frontend #88](https://github.com/lexmount/abyss-frontend/pull/88) and [design](https://github.com/lexmount/abyss-frontend/blob/task/optimize-services-deploy/docs/optimize-services-deploy.md).
