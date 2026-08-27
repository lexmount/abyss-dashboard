import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  InvalidStaticPathError,
  contentTypeFor,
  resolveStaticPath,
} from "./static.mjs";

test("resolves static and SPA paths below the distribution root", () => {
  const root = resolve("/tmp/abyss-dashboard-dist");

  assert.equal(resolveStaticPath(root, "/"), resolve(root, "index.html"));
  assert.equal(
    resolveStaticPath(root, "/assets/dashboard.js"),
    resolve(root, "assets/dashboard.js"),
  );
  assert.equal(
    resolveStaticPath(root, "/sessions/session%201"),
    resolve(root, "sessions/session 1"),
  );
});

test("rejects decoded traversal, invalid encoding, and backslashes", () => {
  const root = resolve("/tmp/abyss-dashboard-dist");

  for (const pathname of ["/..%2Fsecret", "/%E0%A4%A", "/..%5Csecret"]) {
    assert.throws(() => resolveStaticPath(root, pathname), InvalidStaticPathError);
  }
});

test("selects conservative content types", () => {
  assert.equal(contentTypeFor("index.html"), "text/html; charset=utf-8");
  assert.equal(contentTypeFor("dashboard.js"), "text/javascript; charset=utf-8");
  assert.equal(contentTypeFor("unknown.bin"), "application/octet-stream");
});
