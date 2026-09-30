/** Status of a request that never reached the dashboard server. */
export const NETWORK_ERROR_STATUS = 0;

export class ApiError extends Error {
  /** HTTP status, or {@link NETWORK_ERROR_STATUS} when no response arrived. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      credentials: init.credentials ?? "same-origin",
      headers,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ApiError(message, NETWORK_ERROR_STATUS);
  }

  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }

  return (await response.json()) as T;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

/** What went wrong with a request, in terms a reader can act on. */
export type ApiErrorKind = "unreachable" | "unauthorized" | "notFound" | "server";

export function apiErrorKind(error: unknown): ApiErrorKind {
  if (!(error instanceof ApiError)) {
    return "server";
  }
  switch (error.status) {
    case NETWORK_ERROR_STATUS:
    case 502:
    case 503:
    case 504:
      return "unreachable";
    case 401:
    case 403:
      return "unauthorized";
    case 404:
      return "notFound";
    default:
      return "server";
  }
}

/** The raw failure, for a detail line under the friendly message. */
export function apiErrorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status === NETWORK_ERROR_STATUS
      ? error.message
      : `HTTP ${error.status} · ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
