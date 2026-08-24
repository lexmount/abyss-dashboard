import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/i18n-context";
import SessionsPage, { paramsFromFilters } from "./page";

const { searchSessionsMock } = vi.hoisted(() => ({
  searchSessionsMock: vi.fn(),
}));

vi.mock("@/api/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/usage")>();
  return { ...actual, searchSessions: searchSessionsMock };
});

vi.mock("@/components/layouts/base-layout", () => ({
  BaseLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("SessionsPage", () => {
  beforeEach(() => {
    window.localStorage.setItem("abyss-ui-language", "en");
    searchSessionsMock.mockResolvedValue(searchResponse());
  });

  afterEach(() => {
    cleanup();
    searchSessionsMock.mockReset();
  });

  it("does not query until the user submits a keyword", () => {
    renderPage("/sessions");

    expect(
      screen.getByRole("textbox", { name: "Search keywords" }),
    ).toBeInTheDocument();
    expect(searchSessionsMock).not.toHaveBeenCalled();
    expect(screen.getByText("Search session context")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Search captured conversation text, tool calls, commands, and file paths.",
      ),
    ).not.toBeInTheDocument();
  });

  it("renders safe highlights and links the whole result to the existing detail page", async () => {
    renderPage("/sessions?q=timeout");

    expect(await screen.findByText("timeout")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /session-provider-id/ });
    expect(link).toHaveAttribute(
      "href",
      "/sessions/019fcfff-ba46-7340-bd15-600791fe583f",
    );
    expect(screen.getByText("timeout").tagName).toBe("MARK");
    expect(searchSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: "timeout", page: 1, pageSize: 20 }),
    );
  });

  it("submits the search form through the existing sessions route", async () => {
    renderPage("/sessions");
    const user = userEvent.setup();

    await user.type(
      screen.getByRole("textbox", { name: "Search keywords" }),
      "timeout",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("timeout")).toBeInTheDocument();
    expect(searchSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: "timeout" }),
    );
  });
});

describe("session search URL parameters", () => {
  it("keeps only active filters and omits the first page", () => {
    const params = paramsFromFilters(
      {
        q: " timeout ",
        from: "",
        to: "",
        agentName: "codex",
        provider: "",
        model: "gpt-5",
        eventType: "request",
      },
      1,
    );

    expect(params.toString()).toBe(
      "q=timeout&agent_name=codex&llm_model=gpt-5&event_type=request",
    );
  });
});

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/sessions" element={<SessionsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function searchResponse() {
  return {
    query: "timeout",
    total_sessions: 1,
    page: 1,
    page_size: 20,
    has_more: false,
    items: [
      {
        session_pk: "019fcfff-ba46-7340-bd15-600791fe583f",
        session_id: "session-provider-id",
        agent_name: "codex",
        agent_version: "0.12.0",
        host_name: "alice-mbp",
        platform: "macos",
        started_at: "2026-08-05T10:00:00Z",
        ended_at: "2026-08-05T10:10:00Z",
        providers: ["openai"],
        models: ["gpt-5"],
        match_count: 1,
        matches: [
          {
            event_pk: "event-1",
            turn_pk: "turn-1",
            turn_index: 2,
            event_type: "response",
            llm_provider: "openai",
            llm_model: "gpt-5",
            observed_at: "2026-08-05T10:05:00Z",
            fragments: [
              {
                segments: [
                  { text: "Fix ", highlighted: false },
                  { text: "timeout", highlighted: true },
                  { text: " handling", highlighted: false },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
