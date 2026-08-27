import assert from "node:assert/strict";
import test from "node:test";

import { buildUpstreamHeaders, buildUpstreamUrl } from "./proxy.mjs";

test("rewrites the API prefix while preserving the query", () => {
  const backend = new URL("http://127.0.0.1:8080");

  assert.equal(
    buildUpstreamUrl("/api/v1/agent-usage/search?q=hello", backend).href,
    "http://127.0.0.1:8080/v1/agent-usage/search?q=hello",
  );
  assert.equal(buildUpstreamUrl("/api", backend).href, "http://127.0.0.1:8080/");
  assert.throws(() => buildUpstreamUrl("/other", backend), /must begin/u);
});

test("replaces browser credentials and forwarding headers", () => {
  const headers = buildUpstreamHeaders(
    {
      headers: {
        authorization: "Bearer browser-token",
        connection: "upgrade",
        cookie: "session=browser-secret",
        host: "127.0.0.1:5173",
        "x-forwarded-for": "untrusted",
        "x-request-id": "request-1",
      },
      socket: { remoteAddress: "127.0.0.1" },
    },
    "backend-token",
  );

  assert.equal(headers.authorization, "Bearer backend-token");
  assert.equal(headers["x-forwarded-for"], "127.0.0.1");
  assert.equal(headers["x-forwarded-host"], "127.0.0.1:5173");
  assert.equal(headers["x-forwarded-prefix"], "/api");
  assert.equal(headers["x-forwarded-proto"], "http");
  assert.equal(headers["x-request-id"], "request-1");
  assert.equal(headers.cookie, undefined);
  assert.equal(headers.connection, undefined);
  assert.equal(headers.host, undefined);
});
