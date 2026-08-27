import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

import { applySecurityHeaders, sendText } from "./http.mjs";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

export class InvalidStaticPathError extends Error {}

export function contentTypeFor(path) {
  return CONTENT_TYPES.get(extname(path).toLowerCase()) ?? "application/octet-stream";
}

export function resolveStaticPath(distRoot, encodedPathname) {
  let pathname;
  try {
    pathname = decodeURIComponent(encodedPathname);
  } catch {
    throw new InvalidStaticPathError("request path is not valid UTF-8");
  }
  if (pathname.includes("\0") || pathname.includes("\\")) {
    throw new InvalidStaticPathError("request path contains invalid characters");
  }

  const root = resolve(distRoot);
  const relativePath = pathname.replace(/^\/+/, "") || "index.html";
  const path = resolve(root, relativePath);
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new InvalidStaticPathError("request path escapes the dashboard root");
  }
  return path;
}

async function existingFile(path) {
  try {
    const metadata = await lstat(path);
    if (metadata.isFile()) {
      return { path, metadata };
    }
    if (metadata.isDirectory()) {
      const indexPath = resolve(path, "index.html");
      const indexMetadata = await lstat(indexPath);
      return indexMetadata.isFile()
        ? { path: indexPath, metadata: indexMetadata }
        : undefined;
    }
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") {
      throw error;
    }
  }
  return undefined;
}

async function serveFile(request, response, file) {
  applySecurityHeaders(response);
  response.writeHead(200, {
    "content-type": contentTypeFor(file.path),
    "content-length": file.metadata.size,
    "cache-control": "no-cache",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  await pipeline(createReadStream(file.path), response);
}

export async function serveStaticRequest(request, response, distRoot, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("allow", "GET, HEAD");
    sendText(response, 405, "method not allowed\n", "text/plain; charset=utf-8");
    return;
  }

  const requestedPath = resolveStaticPath(distRoot, pathname);
  const file =
    (await existingFile(requestedPath)) ??
    (await existingFile(resolve(distRoot, "index.html")));
  if (file === undefined) {
    sendText(response, 404, "not found\n", "text/plain; charset=utf-8");
    return;
  }
  await serveFile(request, response, file);
}
