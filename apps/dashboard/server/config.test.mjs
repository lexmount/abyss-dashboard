import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DashboardConfigurationError,
  loadApiToken,
  parseServerOptions,
} from "./config.mjs";

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "abyss-dashboard-config-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("parses defaults, environment, and explicit overrides", () => {
  const defaults = parseServerOptions(["--token-file", "token"], {});
  assert.equal(defaults.action, "serve");
  assert.equal(defaults.host, "127.0.0.1");
  assert.equal(defaults.port, 5173);
  assert.equal(defaults.backendUrl.origin, "http://127.0.0.1:8080");

  const configured = parseServerOptions(
    ["--port=0", "--backend", "https://127.0.0.1:9443"],
    {
      ABYSS_DASHBOARD_HOST: "::1",
      ABYSS_DASHBOARD_PORT: "9000",
      ABYSS_DASHBOARD_BACKEND_URL: "http://127.0.0.1:8080",
      ABYSS_DASHBOARD_API_TOKEN_FILE: "/private/token",
    },
  );
  assert.equal(configured.host, "::1");
  assert.equal(configured.port, 0);
  assert.equal(configured.backendUrl.origin, "https://127.0.0.1:9443");
  assert.equal(configured.tokenFile, "/private/token");
});

test("help and version do not require runtime configuration", () => {
  assert.deepEqual(parseServerOptions(["--help"], {}), { action: "help" });
  assert.deepEqual(parseServerOptions(["-v"], {}), { action: "version" });
});

test("rejects unsafe URLs, invalid ports, and missing credentials", () => {
  for (const backend of [
    "postgres://127.0.0.1",
    "http://user@127.0.0.1",
    "http://127.0.0.1/backend",
    "http://127.0.0.1?token=value",
  ]) {
    assert.throws(
      () => parseServerOptions(["--backend", backend, "--token-file", "token"], {}),
      DashboardConfigurationError,
    );
  }
  assert.throws(
    () => parseServerOptions(["--port", "65536", "--token-file", "token"], {}),
    /between 0 and 65535/u,
  );
  assert.throws(() => parseServerOptions([], {}), /token-file/u);
});

test("loads a private regular bearer-token file", async (t) => {
  const directory = await temporaryDirectory(t);
  const tokenFile = join(directory, "backend.token");
  await writeFile(tokenFile, "private-token_123\n", { mode: 0o600 });

  assert.equal(await loadApiToken(tokenFile), "private-token_123");
});

test("rejects symlinks, public permissions, and invalid token contents", async (t) => {
  const directory = await temporaryDirectory(t);
  const tokenFile = join(directory, "backend.token");
  const tokenLink = join(directory, "backend-token-link");
  await writeFile(tokenFile, "valid-token\n", { mode: 0o600 });
  await symlink(tokenFile, tokenLink);

  await assert.rejects(loadApiToken(tokenLink), /regular file/u);

  if (process.platform !== "win32") {
    await chmod(tokenFile, 0o644);
    await assert.rejects(loadApiToken(tokenFile), /group or other users/u);
    await chmod(tokenFile, 0o600);
  }

  await writeFile(tokenFile, "invalid token\n", { mode: 0o600 });
  await assert.rejects(loadApiToken(tokenFile), /RFC 6750/u);
});
