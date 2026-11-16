# Product onboarding compatibility

Task `improve-abyss-home.md` adds complete first-use walkthroughs to the Memory and
Transfer public pages in the companion `abyss-frontend` repository. Each flow
installs the client and relevant skill, records a small example, then recalls or
continues it in another agent. The frontend owns this product-specific copy,
routing, installation prompts, and authorization guidance.

The shared UI package remains at 0.5.0. No shared component API or session data
contract changes are necessary for the walkthroughs. Consequently this companion
change documents the integration boundary without adding product skill setup,
authentication, marketing routes, or handoff behavior to the standalone dashboard.
Existing standalone session browsing and the server-side authenticated proxy must
remain compatible with recorded examples. There are no migrations or release
ordering requirements; the two PRs can be reviewed together and merged independently.

Validation runs the full dashboard unit and package/server black-box suites,
formatting, lint, types, production builds, release contracts, and container build.
The submitted dashboard build is deployed against an actual standalone backend,
with synthetic populated, empty, and boundary session scenarios. The product
frontend is also deployed through a gateway to real Identity and Agent Data
services. Source identities, commands, outcomes, screenshots, and both review URLs
are recorded in the coordinator's persistent
`artifacts/improve-abyss-home/test-report.html` report. The companion frontend
commits its own `docs/improve-abyss-home.md` design and route regression coverage.

## Coordinated review

- [Dashboard PR #18](https://github.com/lexmount/abyss-dashboard/pull/18)
- [Frontend PR #82](https://github.com/lexmount/abyss-frontend/pull/82) and its
  [walkthrough design](https://github.com/lexmount/abyss-frontend/blob/task/improve-abyss-home/docs/improve-abyss-home.md)
