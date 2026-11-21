# Desktop observation setup and standalone review

The [desktop installation guide](https://abyss.lexmount.com/docs/product/saas-service/installation/macos#configure-observation)
explains how to select the agents and model providers captured by the Abyss
desktop client. The client owns capture configuration. This dashboard reads
the resulting events from the standalone backend through its existing proxy.

This companion records the integration boundary. The illustrated instructions
ship in the product frontend. The standalone routes, event contracts, and
published UI package require no runtime changes. Verify a seeded session and
an empty filter result through the standalone proxy alongside the product
installation journey.

The two changes can merge independently.
[Companion design](https://github.com/lexmount/abyss-frontend/blob/task/agent-observation-guide/docs/agent-observation-guide.md) ·
[Companion PR](https://github.com/lexmount/abyss-frontend/pulls?q=is%3Apr+head%3Atask%2Fagent-observation-guide) ·
[Validation checks](https://github.com/lexmount/abyss-dashboard/pulls?q=is%3Apr+head%3Atask%2Fagent-observation-guide).
The local review report is `artifacts/agent-observation-guide/test-report.html`
in the coordinator workspace.
