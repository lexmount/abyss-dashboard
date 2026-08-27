# `@lexmount.com/abyss-dashboard`

Local web dashboard for a standalone
[`abyss-backend`](https://github.com/lexmount/abyss-backend) deployment.

## Run

Node.js 22 or newer is required. Create a private file containing the plaintext
bearer token whose SHA-256 digest is configured in `abyss-backend`, then start
the dashboard:

```bash
install -m 0600 /dev/null "$HOME/.abyss/backend.token"
printf '%s\n' "$ABYSS_API_TOKEN" > "$HOME/.abyss/backend.token"

npx --yes @lexmount.com/abyss-dashboard@0.1.0 \
  --backend http://127.0.0.1:8080 \
  --token-file "$HOME/.abyss/backend.token"
```

Open <http://127.0.0.1:5173>. The local Node.js server injects the bearer token
into proxied `/api` requests; the token is never compiled into or returned with
the browser assets.

Run `npx --yes @lexmount.com/abyss-dashboard@0.1.0 --help` for all options and
environment-variable equivalents. The server binds only to IPv4 loopback by
default.
