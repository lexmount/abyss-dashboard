import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 5173;
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8080";
const BEARER_TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/u;

const OPTION_ENVIRONMENT = Object.freeze({
  host: "ABYSS_DASHBOARD_HOST",
  port: "ABYSS_DASHBOARD_PORT",
  backend: "ABYSS_DASHBOARD_BACKEND_URL",
  "token-file": "ABYSS_DASHBOARD_API_TOKEN_FILE",
});

export class DashboardConfigurationError extends Error {}

function parseArguments(argv) {
  const values = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      values.set("action", "help");
      continue;
    }
    if (argument === "--version" || argument === "-v") {
      values.set("action", "version");
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new DashboardConfigurationError(`unexpected argument: ${argument}`);
    }

    const separator = argument.indexOf("=");
    const name = argument.slice(2, separator === -1 ? undefined : separator);
    if (!Object.hasOwn(OPTION_ENVIRONMENT, name)) {
      throw new DashboardConfigurationError(`unknown option: --${name}`);
    }

    const value = separator === -1 ? argv[index + 1] : argument.slice(separator + 1);
    if (value === undefined || value.startsWith("--")) {
      throw new DashboardConfigurationError(`--${name} requires a value`);
    }
    if (separator === -1) {
      index += 1;
    }
    values.set(name, value);
  }

  return values;
}

function configuredValue(argumentsByName, environment, name, fallback) {
  const value =
    argumentsByName.get(name) ?? environment[OPTION_ENVIRONMENT[name]] ?? fallback;
  return typeof value === "string" ? value.trim() : value;
}

function parsePort(value) {
  const normalized = String(value);
  if (!/^\d+$/u.test(normalized)) {
    throw new DashboardConfigurationError("dashboard port must be numeric");
  }
  const port = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new DashboardConfigurationError("dashboard port must be between 0 and 65535");
  }
  return port;
}

function parseBackendUrl(value) {
  let backendUrl;
  try {
    backendUrl = new URL(value);
  } catch (error) {
    throw new DashboardConfigurationError(
      `backend URL must be an absolute URL: ${error.message}`,
    );
  }

  if (
    !["http:", "https:"].includes(backendUrl.protocol) ||
    backendUrl.username !== "" ||
    backendUrl.password !== "" ||
    backendUrl.search !== "" ||
    backendUrl.hash !== "" ||
    !["", "/"].includes(backendUrl.pathname)
  ) {
    throw new DashboardConfigurationError(
      "backend URL must be an HTTP(S) origin without credentials, path, query, or fragment",
    );
  }

  backendUrl.pathname = "/";
  return backendUrl;
}

export function parseServerOptions(argv, environment = process.env) {
  const argumentsByName = parseArguments(argv);
  const action = argumentsByName.get("action");
  if (action !== undefined) {
    return { action };
  }

  const host = configuredValue(argumentsByName, environment, "host", DEFAULT_HOST);
  if (host === "") {
    throw new DashboardConfigurationError("dashboard host must not be empty");
  }

  const tokenFile = configuredValue(argumentsByName, environment, "token-file");
  if (tokenFile === undefined || tokenFile === "") {
    throw new DashboardConfigurationError(
      "--token-file or ABYSS_DASHBOARD_API_TOKEN_FILE is required",
    );
  }

  return {
    action: "serve",
    host,
    port: parsePort(
      configuredValue(argumentsByName, environment, "port", DEFAULT_PORT),
    ),
    backendUrl: parseBackendUrl(
      configuredValue(argumentsByName, environment, "backend", DEFAULT_BACKEND_URL),
    ),
    tokenFile: resolve(tokenFile),
  };
}

export async function loadApiToken(tokenFile) {
  let metadata;
  try {
    metadata = await lstat(tokenFile);
  } catch (error) {
    throw new DashboardConfigurationError(
      `cannot inspect API token file ${tokenFile}: ${error.message}`,
    );
  }
  if (!metadata.isFile()) {
    throw new DashboardConfigurationError(
      `API token path must be a regular file: ${tokenFile}`,
    );
  }
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new DashboardConfigurationError(
      `API token file must not be accessible by group or other users: ${tokenFile}`,
    );
  }

  let token;
  try {
    token = (await readFile(tokenFile, "utf8")).trim();
  } catch (error) {
    throw new DashboardConfigurationError(
      `cannot read API token file ${tokenFile}: ${error.message}`,
    );
  }
  if (!BEARER_TOKEN_PATTERN.test(token)) {
    throw new DashboardConfigurationError(
      "API token must use the RFC 6750 bearer-token character set",
    );
  }
  return token;
}
