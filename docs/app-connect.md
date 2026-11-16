# Desktop screenshot compatibility

Task `app-connect.md` changes the AbyssApp central proxy button to its canonical
line-art logo and updates product-site screenshots in `abyss-frontend`.
[AbyssApp PR #88](https://github.com/lexmount/AbyssApp/pull/88) owns the native
dashboard and its production-build capture utility. The frontend owns the
localized home-page demonstrations and installation-guide images.

The standalone dashboard displays stored sessions and usage; it does not host
the native proxy control or product installation marketing. There is no matching
standalone screen, API, or reusable presentation component to change. This
companion records that boundary and the coordinated validation instead of adding
native Host behavior to the shared package. The released UI package remains
unchanged, and no package publication or service migration is required.

Run the existing unit, package black-box, formatting, lint, type, and production
build checks. Deploy this revision with the real standalone backend, seed
representative sessions, and verify its proxy routes while the companion product
stack serves the refreshed screenshots. The persistent task report at
`task-artifacts/app-connect/test-report.html` in the coordinator records commits,
commands, results, and review URLs. This documentation-only companion can merge
independently; the product screenshots should follow availability of the native
logo-control change.

## Coordinated review

- Native control and capture utility: [PR](https://github.com/lexmount/AbyssApp/pull/88) and [design](https://github.com/lexmount/AbyssApp/blob/task/app-connect/docs/app-connect.md).
- Website screenshots: [PR](https://github.com/lexmount/abyss-frontend/pull/85) and [design](https://github.com/lexmount/abyss-frontend/blob/task/app-connect/docs/app-connect.md).
