import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "@/api/http";

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
