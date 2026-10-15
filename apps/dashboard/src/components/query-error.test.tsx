import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/http";
import { QueryErrorBanner, QueryErrorCard } from "@/components/query-error";
import { I18nProvider } from "@/contexts/i18n-context";

describe("QueryErrorCard", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("explains an unreachable backend and retries on request", async () => {
    const onRetry = vi.fn();
    render(
      <I18nProvider>
        <QueryErrorCard
          error={new ApiError("backend unavailable", 502)}
          onRetry={onRetry}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("HTTP 502 · backend unavailable")).toBeTruthy();
    await userEvent.click(screen.getByRole("button"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("lets a page name what was not found", () => {
    render(
      <I18nProvider>
        <QueryErrorBanner error={new ApiError("missing", 404)} title="Gone" />
      </I18nProvider>,
    );

    expect(screen.getByText("Gone")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
