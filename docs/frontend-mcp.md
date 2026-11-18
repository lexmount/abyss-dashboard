# Finding the hosted MCP guide

The dashboard README introduces the standalone backend and describes which
session features it serves. Link from that introduction to the product guide
for readers who want an MCP client to query their Abyss SaaS account.

The product frontend owns the localized guide, screenshots and public route.
See the [technical design](https://github.com/lexmount/abyss-frontend/blob/docs/frontend-mcp/docs/frontend-mcp.md) in [frontend PR #89](https://github.com/lexmount/abyss-frontend/pull/89). The link goes to the
documentation on the product website. It carries no dashboard URL, identity or
session data and needs no shared UI release. Merge the product guide and deploy
it before merging the README link.

Verify the link target against the deployed review page and exercise a seeded
standalone session through the dashboard. Review evidence is in
`artifacts/frontend-mcp/test-report.html` in the coordinator workspace.
