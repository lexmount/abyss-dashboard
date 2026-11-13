# Documentation navigation ownership

Task: `fix-docs.md`. Baseline: `ba4db0672ea2d79976bce44ad24e90b7448a2383`.

The product website documentation retained the previous page scroll position.
The fix belongs to abyss-frontend public navigation and asynchronous document
body lifecycle. This standalone dashboard has no documentation surface; its
existing dashboard, comparison, session and event-detail navigation stays intact.

The coordinated regression test checks that documentation paths resolve to the
standalone not-found page and that session routes remain available. Routing and
scroll policy remain with consuming applications, outside the presentation-only
`@lexmount.com/abyss-ui` package. There is no API, schema, dependency, authentication
or package release change and no required merge order with the frontend fix.

Validation: dashboard unit and package black-box suites, formatting, lint, types,
build and container checks; seeded standalone backend and product gateway checks.
Evidence is preserved in `artifacts/fix-docs/test-report.html` in the coordinator.
