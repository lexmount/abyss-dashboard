import http from "node:http";
import https from "node:https";

import { applySecurityHeaders, sendJson } from "./http.mjs";

const REQUEST_HEADERS_TO_REMOVE = new Set([
  "authorization",
  "connection",
  "cookie",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-prefix",
  "x-forwarded-proto",
]);

const RESPONSE_HEADERS_TO_REMOVE = new Set([
  "connection",
  "content-security-policy",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "referrer-policy",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-content-type-options",
  "x-frame-options",
]);

export function buildUpstreamUrl(requestUrl, backendUrl) {
  const request = new URL(requestUrl, "http://dashboard.invalid");
  if (request.pathname !== "/api" && !request.pathname.startsWith("/api/")) {
    throw new Error("proxy request path must begin with /api");
  }

  const upstream = new URL(backendUrl);
  upstream.pathname = request.pathname.slice(4) || "/";
  upstream.search = request.search;
  return upstream;
}

export function buildUpstreamHeaders(request, token) {
  const headers = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && !REQUEST_HEADERS_TO_REMOVE.has(name.toLowerCase())) {
      headers[name.toLowerCase()] = value;
    }
  }

  headers.authorization = `Bearer ${token}`;
  headers["x-forwarded-for"] = request.socket.remoteAddress ?? "unknown";
  headers["x-forwarded-host"] = request.headers.host ?? "unknown";
  headers["x-forwarded-prefix"] = "/api";
  headers["x-forwarded-proto"] = "http";
  return headers;
}

function responseHeaders(headers) {
  const forwarded = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !RESPONSE_HEADERS_TO_REMOVE.has(name.toLowerCase())) {
      forwarded[name] = value;
    }
  }
  return forwarded;
}

export function proxyApiRequest(request, response, backendUrl, token) {
  const upstreamUrl = buildUpstreamUrl(request.url, backendUrl);
  const transport = upstreamUrl.protocol === "https:" ? https : http;

  return new Promise((resolve) => {
    const upstreamRequest = transport.request(
      upstreamUrl,
      {
        method: request.method,
        headers: buildUpstreamHeaders(request, token),
      },
      (upstreamResponse) => {
        applySecurityHeaders(response);
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          responseHeaders(upstreamResponse.headers),
        );
        upstreamResponse.pipe(response);
        upstreamResponse.once("end", resolve);
        upstreamResponse.once("error", () => {
          response.destroy();
          resolve();
        });
        response.once("close", () => {
          if (!upstreamResponse.complete) {
            upstreamResponse.destroy();
          }
        });
      },
    );

    upstreamRequest.setTimeout(30_000, () => {
      upstreamRequest.destroy(new Error("backend request timed out"));
    });
    upstreamRequest.once("error", () => {
      if (response.headersSent) {
        response.destroy();
      } else {
        sendJson(response, 502, { error: "backend unavailable" });
      }
      resolve();
    });
    request.once("aborted", () => upstreamRequest.destroy());
    request.pipe(upstreamRequest);
  });
}
