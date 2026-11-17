# Japanese product naming in the standalone console

The standalone console uses アビス for the product name in Japanese. The
standalone translation dictionary owns the visible console label, missing-page
copy, and backend error text. The browser tab follows the active UI language.
The published presentation package continues to receive labels from its
consumers and needs no changes for this localization.

Exercise the existing language selector and check the console against a seeded
standalone backend. Verify the Japanese label and tab title, then switch to
English. Run the dashboard unit and package tests, quality checks, and
container proxy check.

Companion changes and verification

- [abyss-rs design](https://github.com/lexmount/abyss-rs/blob/main/docs/jp-text.md) · [Task PR](https://github.com/lexmount/abyss-rs/pulls?q=is%3Apr+head%3Atask%2Fjp-text)
- [abyss-frontend design](https://github.com/lexmount/abyss-frontend/blob/main/docs/jp-text.md) · [Task PR](https://github.com/lexmount/abyss-frontend/pulls?q=is%3Apr+head%3Atask%2Fjp-text)
- [CI and validation evidence](https://github.com/lexmount/abyss-dashboard/pulls?q=is%3Apr+head%3Atask%2Fjp-text)
