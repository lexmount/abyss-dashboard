import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "@lexmount.com/abyss-dashboard";

async function listen(server) {
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  return address.port;
}

async function close(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) {
        resolveClose();
      } else {
        rejectClose(error);
      }
    });
  });
}

function waitForDashboard(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const ready = new Promise((resolveReady, rejectReady) => {
    const inspectOutput = () => {
      const match = stdout.match(
        /Abyss dashboard is running at (http:\/\/[^\s]+)/u,
      );
      if (match !== null) {
        resolveReady(match[1]);
      }
    };
    child.stdout.on("data", inspectOutput);
    child.once("exit", (code, signal) => {
      rejectReady(
        new Error(
          `packed dashboard exited before readiness (code=${code}, signal=${signal}): ${stderr}`,
        ),
      );
    });
  });

  return {
    ready,
    output: () => ({ stdout, stderr }),
  };
}

async function stopProcess(child) {
  const exited = new Promise((resolveExit) => {
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  child.kill("SIGTERM");
  return Promise.race([
    exited,
    new Promise((_, rejectTimeout) => {
      setTimeout(
        () => rejectTimeout(new Error("dashboard did not stop after SIGTERM")),
        5_000,
      ).unref();
    }),
  ]);
}

test("the packed dashboard serves assets and securely proxies the backend", async (t) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "abyss-dashboard-package-"),
  );
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const packRoot = join(temporaryRoot, "pack");
  const installRoot = join(temporaryRoot, "install");
  await mkdir(packRoot);

  await execFileAsync("npm", ["run", "build"], {
    cwd: repositoryRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  const { stdout: packOutput } = await execFileAsync(
    "npm",
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--workspace",
      packageName,
      "--pack-destination",
      packRoot,
    ],
    { cwd: repositoryRoot, maxBuffer: 10 * 1024 * 1024 },
  );
  const [packed] = JSON.parse(packOutput);
  const packedFiles = new Set(packed.files.map((file) => file.path));
  for (const requiredFile of [
    "bin/abyss-dashboard.mjs",
    "dist/index.html",
    "LICENSE",
    "server/cli.mjs",
    "server/config.mjs",
    "server/http.mjs",
    "server/proxy.mjs",
    "server/server.mjs",
    "server/static.mjs",
    "package.json",
    "README.md",
  ]) {
    assert.ok(packedFiles.has(requiredFile), `${requiredFile} must be packed`);
  }
  assert.equal(
    [...packedFiles].some(
      (path) =>
        path.startsWith("src/") ||
        path.endsWith(".test.mjs") ||
        path.includes("nginx"),
    ),
    false,
    "source, tests, and container configuration must not be packed",
  );

  const tarball = join(packRoot, packed.filename);
  await execFileAsync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      installRoot,
      tarball,
    ],
    { cwd: repositoryRoot, maxBuffer: 10 * 1024 * 1024 },
  );

  const backendRequests = [];
  const backend = createServer((request, response) => {
    backendRequests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
    });
    response.setHeader("content-type", "application/json");
    response.setHeader("set-cookie", "backend-secret=must-not-reach-browser");
    response.setHeader("x-frame-options", "SAMEORIGIN");
    response.end(JSON.stringify({ status: "proxied" }));
  });
  const backendPort = await listen(backend);
  t.after(() => (backend.listening ? close(backend) : undefined));

  const token = "blackbox-private-token";
  const tokenFile = join(temporaryRoot, "backend.token");
  await writeFile(tokenFile, `${token}\n`, { mode: 0o600 });
  if (process.platform !== "win32") {
    await chmod(tokenFile, 0o600);
  }

  const executable = join(
    installRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "abyss-dashboard.cmd" : "abyss-dashboard",
  );
  const child = spawn(
    executable,
    [
      "--port",
      "0",
      "--backend",
      `http://127.0.0.1:${backendPort}`,
      "--token-file",
      tokenFile,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const dashboard = waitForDashboard(child);
  t.after(() => {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  });
  const dashboardUrl = await dashboard.ready;

  const health = await fetch(`${dashboardUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "ok\n");

  const home = await fetch(dashboardUrl);
  const homeBody = await home.text();
  assert.equal(home.status, 200);
  assert.match(homeBody, /<div id="root"><\/div>/u);
  assert.equal(homeBody.includes(token), false);
  assert.equal(home.headers.get("x-frame-options"), "DENY");

  const spaRoute = await fetch(`${dashboardUrl}/sessions/example-session`);
  assert.equal(spaRoute.status, 200);
  assert.match(await spaRoute.text(), /<div id="root"><\/div>/u);

  const api = await fetch(`${dashboardUrl}/api/v1/agent-usage/events?limit=1`, {
    headers: {
      authorization: "Bearer browser-token",
      cookie: "browser-secret=must-not-reach-backend",
      "x-forwarded-for": "untrusted-client",
    },
  });
  assert.equal(api.status, 200);
  assert.deepEqual(await api.json(), { status: "proxied" });
  assert.equal(api.headers.has("set-cookie"), false);
  assert.equal(api.headers.get("x-frame-options"), "DENY");
  assert.equal(backendRequests.length, 1);
  assert.equal(backendRequests[0].method, "GET");
  assert.equal(backendRequests[0].url, "/v1/agent-usage/events?limit=1");
  assert.equal(backendRequests[0].headers.authorization, `Bearer ${token}`);
  assert.equal(backendRequests[0].headers.cookie, undefined);
  assert.equal(backendRequests[0].headers["x-forwarded-for"], "127.0.0.1");

  await close(backend);
  const unavailable = await fetch(`${dashboardUrl}/api/healthz`);
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), { error: "backend unavailable" });

  const output = dashboard.output();
  assert.equal(output.stdout.includes(token), false);
  assert.equal(output.stderr.includes(token), false);

  const exit = await stopProcess(child);
  assert.deepEqual(exit, { code: 0, signal: null });
});
