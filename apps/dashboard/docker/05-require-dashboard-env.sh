#!/bin/sh
set -eu

: "${ABYSS_DASHBOARD_API_TOKEN:?ABYSS_DASHBOARD_API_TOKEN is required}"
: "${ABYSS_DASHBOARD_BACKEND_UPSTREAM:?ABYSS_DASHBOARD_BACKEND_UPSTREAM is required}"

case "$ABYSS_DASHBOARD_API_TOKEN" in
  *[!A-Za-z0-9._~+/=-]*)
    echo "ABYSS_DASHBOARD_API_TOKEN must use the RFC 6750 bearer-token character set" >&2
    exit 1
    ;;
esac

case "$ABYSS_DASHBOARD_BACKEND_UPSTREAM" in
  *[!A-Za-z0-9._:-]*)
    echo "ABYSS_DASHBOARD_BACKEND_UPSTREAM must be a DNS name or IPv4 host with an optional port" >&2
    exit 1
    ;;
esac

case "$ABYSS_DASHBOARD_BACKEND_SCHEME" in
  http|https) ;;
  *)
    echo "ABYSS_DASHBOARD_BACKEND_SCHEME must be http or https" >&2
    exit 1
    ;;
esac

case "$NGINX_PORT" in
  ""|*[!0-9]*)
    echo "NGINX_PORT must be numeric" >&2
    exit 1
    ;;
esac
