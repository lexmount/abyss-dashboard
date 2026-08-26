import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesSourceUrl = new URL(
  "../packages/ui/src/styles.css",
  import.meta.url,
);
const builtStylesUrl = new URL(
  "../packages/ui/dist/styles.css",
  import.meta.url,
);

function findBlockEnd(css, openingBraceIndex) {
  let depth = 0;

  for (let index = openingBraceIndex; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function utilityLayer(css) {
  const layerIndex = css.indexOf("@layer utilities");
  assert.notEqual(layerIndex, -1, "built CSS must declare a utilities layer");

  const openingBraceIndex = css.indexOf("{", layerIndex);
  assert.notEqual(
    openingBraceIndex,
    -1,
    "utilities layer must have a rule body",
  );

  const closingBraceIndex = findBlockEnd(css, openingBraceIndex);
  assert.notEqual(closingBraceIndex, -1, "utilities layer must be balanced");

  return css.slice(openingBraceIndex + 1, closingBraceIndex);
}

test("publishes Tailwind utilities inside the standard utilities layer", async () => {
  const source = await readFile(stylesSourceUrl, "utf8");
  assert.match(
    source,
    /@import "tailwindcss\/utilities\.css" layer\(utilities\);/,
  );

  const builtStyles = await readFile(builtStylesUrl, "utf8");
  const utilities = utilityLayer(builtStyles);

  assert.match(
    utilities,
    /\.max-w-\\\[calc\\\(100\\%-2rem\\\)\\\]/,
    "DialogContent's default max width must remain a layered utility",
  );
  assert.match(
    utilities,
    /\.sm\\\:max-w-lg/,
    "responsive max-width utilities must share the same cascade layer",
  );
});
