import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiErrorDetail, apiErrorKind, fetchJson } from "@/api/http";

describe("fetchJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes request init through while preserving JSON defaults", async () => {
    const fetchMock = vi.fn<Window["fetch"]>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchJson<{ ok: boolean }>("/api/example", {
      body: JSON.stringify({ name: "Abyss" }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/example",
      expect.objectContaining({
        body: JSON.stringify({ name: "Abyss" }),
        credentials: "same-origin",
        method: "POST",
      }),
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});

describe("apiErrorKind", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats a failed fetch and gateway errors as an unreachable backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const error = await fetchJson("/api/example").catch((reason: unknown) => reason);

    expect(apiErrorKind(error)).toBe("unreachable");
    expect(apiErrorDetail(error)).toBe("Failed to fetch");
    expect(apiErrorKind(new ApiError("backend unavailable", 502))).toBe("unreachable");
    expect(apiErrorDetail(new ApiError("backend unavailable", 502))).toBe(
      "HTTP 502 · backend unavailable",
    );
  });

  it("separates authorization, missing, and other server errors", () => {
    expect(apiErrorKind(new ApiError("unauthorized", 401))).toBe("unauthorized");
    expect(apiErrorKind(new ApiError("not found", 404))).toBe("notFound");
    expect(apiErrorKind(new ApiError("boom", 500))).toBe("server");
    expect(apiErrorKind(new Error("parse"))).toBe("server");
  });
});
