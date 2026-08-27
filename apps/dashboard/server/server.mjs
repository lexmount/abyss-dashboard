import { lstat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadApiToken } from "./config.mjs";
import { sendJson, sendText } from "./http.mjs";
import { proxyApiRequest } from "./proxy.mjs";
import { InvalidStaticPathError, serveStaticRequest } from "./static.mjs";

const DEFAULT_DIST_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");

async function requireDistRoot(distRoot) {
  let metadata;
  try {
    metadata = await lstat(distRoot);
  } catch (error) {
    throw new Error(
      `dashboard assets are unavailable at ${distRoot}: ${error.message}`,
    );
  }
  if (!metadata.isDirectory()) {
    throw new Error(`dashboard asset path is not a directory: ${distRoot}`);
  }
}

function requestPathname(request) {
  return new URL(request.url, "http://dashboard.invalid").pathname;
}

export async function startDashboardServer(options, dependencies = {}) {
  const distRoot = dependencies.distRoot ?? DEFAULT_DIST_ROOT;
  const onError = dependencies.onError ?? console.error;
  await requireDistRoot(distRoot);
  const token = await loadApiToken(options.tokenFile);

  const server = createServer(async (request, response) => {
    try {
      const pathname = requestPathname(request);
      if (pathname === "/healthz") {
        sendText(response, 200, "ok\n", "text/plain; charset=utf-8");
      } else if (pathname === "/api" || pathname.startsWith("/api/")) {
        await proxyApiRequest(request, response, options.backendUrl, token);
      } else {
        await serveStaticRequest(request, response, distRoot, pathname);
      }
    } catch (error) {
      if (error instanceof InvalidStaticPathError) {
        sendJson(response, 400, { error: "invalid request path" });
        return;
      }
      onError(error);
      if (response.headersSent) {
        response.destroy();
      } else {
        sendJson(response, 500, { error: "internal server error" });
      }
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    const onListenError = (error) => rejectListen(error);
    server.once("error", onListenError);
    server.listen(options.port, options.host, () => {
      server.off("error", onListenError);
      resolveListen();
    });
  });
  return server;
}
