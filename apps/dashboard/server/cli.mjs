import { readFile } from "node:fs/promises";

import { parseServerOptions } from "./config.mjs";
import { startDashboardServer } from "./server.mjs";

const HELP = `Usage: abyss-dashboard [options]

Serve the standalone Abyss dashboard and proxy its API requests to abyss-backend.

Options:
  --host <host>          Listen host (default: 127.0.0.1)
  --port <port>          Listen port (default: 5173; use 0 for an available port)
  --backend <url>        abyss-backend origin (default: http://127.0.0.1:8080)
  --token-file <path>    File containing the plaintext backend bearer token
  -h, --help             Show this help
  -v, --version          Show the package version

Environment variables:
  ABYSS_DASHBOARD_HOST
  ABYSS_DASHBOARD_PORT
  ABYSS_DASHBOARD_BACKEND_URL
  ABYSS_DASHBOARD_API_TOKEN_FILE
`;

async function packageVersion() {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  return manifest.version;
}

function listenUrl(server) {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("dashboard server did not bind a TCP address");
  }
  const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
  return `http://${host}:${address.port}`;
}

function installShutdownHandlers(server) {
  let closing = false;
  const shutdown = () => {
    if (closing) {
      return;
    }
    closing = true;
    server.close((error) => {
      if (error !== undefined) {
        console.error(`abyss-dashboard: shutdown failed: ${error.message}`);
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  server.once("close", () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  });
}

export async function runCli(argv = process.argv.slice(2), environment = process.env) {
  const options = parseServerOptions(argv, environment);
  if (options.action === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (options.action === "version") {
    process.stdout.write(`${await packageVersion()}\n`);
    return;
  }

  const server = await startDashboardServer(options);
  installShutdownHandlers(server);
  process.stdout.write(`Abyss dashboard is running at ${listenUrl(server)}\n`);
  process.stdout.write(`Proxying API requests to ${options.backendUrl.origin}\n`);
}
