const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

export function applySecurityHeaders(response) {
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  response.setHeader("content-security-policy", CONTENT_SECURITY_POLICY);
}

export function sendText(response, statusCode, content, contentType) {
  const body = Buffer.from(content);
  applySecurityHeaders(response);
  response.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": body.byteLength,
    "cache-control": "no-store",
  });
  response.end(body);
}

export function sendJson(response, statusCode, value) {
  sendText(
    response,
    statusCode,
    `${JSON.stringify(value)}\n`,
    "application/json; charset=utf-8",
  );
}
