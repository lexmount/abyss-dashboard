# Session search ordered by recency

Task: `fix-search-sorting.md`.

Session searches must show the sessions with the most recent matching activity first, including across page boundaries. The Elasticsearch-backed APIs currently omit an explicit sort and therefore return relevance order. Both web applications render the server page as received. The standalone SQLite implementation already orders sessions by their latest matching event.

## Application boundary

Retain the API result order when rendering session cards and navigating pages. Sorting a single browser page cannot establish a global order and would use incomplete preview events; session start time is also not the recency of a matching event. Document this contract beside the response type and result rendering. Add a page interaction regression that preserves a recently resumed old session ahead of a newly started session and keeps the API order after Next and Previous navigation.

The behavior change is implemented in the coordinated `abyss-backend` and `abyss-services` PRs, which sort matching sessions before pagination. The API shape, filter serialization, links, snippets, authentication, and shared presentation package remain compatible. Deploy the matching service PR to enable the new order.

The card timestamp continues to show session start time. It is informational and does not determine result order: an older session with a newer matching event can lead the page. Ordinary session-list ordering is unchanged.

## Validation

Run formatting, lint, types, all unit tests, production and container builds, plus applicable container and Kubernetes checks. Browser black-box verification uses both real review stacks and seeded matching activity spanning multiple pages, filters, empty results, and a resumed session. It checks the actual card order and navigation without mocking API responses.

## Review evidence

The persistent HTML report is `artifacts/fix-search-sorting/test-report.html` in the coordinator workspace. It records tested revisions, commands, results, review URLs, and supporting logs. See the companion designs: [abyss-backend](https://github.com/lexmount/abyss-backend/blob/task/fix-search-sorting/docs/fix-search-sorting.md), [abyss-services](https://github.com/lexmount/abyss-services/blob/task/fix-search-sorting/docs/fix-search-sorting.md), [abyss-frontend](https://github.com/lexmount/abyss-frontend/blob/task/fix-search-sorting/docs/fix-search-sorting.md).

Elasticsearch's [collapse contract](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/collapse-search-results) selects the top sorted document per collapse key.
