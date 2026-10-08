import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/i18n-context";
import SessionsPage, { filtersFromParams, paramsFromFilters } from "./page";

const { listSessionsMock, searchSessionsMock } = vi.hoisted(() => ({
  listSessionsMock: vi.fn(),
  searchSessionsMock: vi.fn(),
}));

vi.mock("@/api/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/usage")>();
  return {
    ...actual,
    listSessions: listSessionsMock,
    searchSessions: searchSessionsMock,
  };
});

vi.mock("@/components/layouts/base-layout", () => ({
  BaseLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("SessionsPage", () => {
  beforeEach(() => {
    window.localStorage.setItem("abyss-ui-language", "en");
    searchSessionsMock.mockResolvedValue(searchResponse());
    listSessionsMock.mockResolvedValue(listResponse());
  });

  afterEach(() => {
    cleanup();
    searchSessionsMock.mockReset();
    listSessionsMock.mockReset();
  });

  it("lists every session until the user searches for a keyword", async () => {
    renderPage("/sessions");

    const link = await screen.findByRole("link", { name: "019fcfff" });
    expect(link).toHaveAttribute(
      "href",
      "/sessions/019fcfff-ba46-7340-bd15-600791fe583f",
    );
    expect(link).toHaveAttribute("title", "019fcfff-ba46-7340-bd15-600791fe583f");
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Codex")).toBeInTheDocument();
    expect(table.getByText("alice-mbp")).toBeInTheDocument();
    expect(table.getByText("Draw a pelican")).toBeInTheDocument();
    expect(table.getByText("Title generation")).toBeInTheDocument();
    expect(listSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
    expect(searchSessionsMock).not.toHaveBeenCalled();
    // Provider and model narrow the list too; the event filter is gone.
    expect(screen.getByRole("combobox", { name: "Provider" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Model" })).toBeEnabled();
    expect(screen.queryByRole("combobox", { name: "Event" })).not.toBeInTheDocument();
    expect(screen.getByTestId("session-search-filter-grid")).toHaveClass(
      "session-search-filter-grid",
    );
  });

  it("lists only sessions that used the chosen provider and model", async () => {
    renderPage("/sessions?llm_provider=openai&llm_model=gpt-5");

    await screen.findByRole("link", { name: "019fcfff" });
    expect(listSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: ["openai"], model: ["gpt-5"] }),
    );
    expect(searchSessionsMock).not.toHaveBeenCalled();
  });

  it("searches and lists with every chosen value from the URL", async () => {
    renderPage(
      "/sessions?q=timeout&agent_name=codex&agent_name=claude-code&llm_model=gpt-5&llm_model=o3",
    );

    expect(await screen.findByText("timeout")).toBeInTheDocument();
    expect(searchSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "timeout",
        agentName: ["codex", "claude-code"],
        provider: [],
        model: ["gpt-5", "o3"],
      }),
    );
    expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
      "Codex+1",
    );
  });

  it("applies several agents chosen in the form", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderPage("/sessions");
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "019fcfff" });

    await user.click(screen.getByRole("combobox", { name: "Agent" }));
    await user.click(screen.getByRole("option", { name: "Claude Code" }));
    await user.click(screen.getByRole("option", { name: "Codex" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(listSessionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ agentName: ["claude-code", "codex"], page: 1 }),
    );
  });

  it("renders safe highlights and opens the session with the search carried over", async () => {
    renderPage("/sessions?q=timeout");

    expect(await screen.findByText("timeout")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /session-provider-id/ });
    expect(link).toHaveAttribute(
      "href",
      "/sessions/019fcfff-ba46-7340-bd15-600791fe583f?q=timeout",
    );
    // A hit opens the session at its own turn.
    const hit = screen.getByRole("link", { name: /Turn 2/ });
    expect(hit).toHaveAttribute(
      "href",
      "/sessions/019fcfff-ba46-7340-bd15-600791fe583f?turn=2&q=timeout",
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
        time: { preset: "any", from: "2026-09-01T08:30", to: "2026-09-07T18:00" },
        agentNames: ["codex", "claude-code"],
        providers: [],
        models: ["gpt-5", " "],
      },
      1,
    );

    expect(params.toString()).toBe(
      "q=timeout&agent_name=codex&agent_name=claude-code&llm_model=gpt-5",
    );
    expect(filtersFromParams(params)).toMatchObject({
      agentNames: ["codex", "claude-code"],
      providers: [],
      models: ["gpt-5"],
    });
  });

  it("writes custom date-time bounds only for the custom time range", () => {
    const base = {
      q: "timeout",
      agentNames: [],
      providers: [],
      models: [],
    };
    const dates = { from: "2026-09-01T08:30", to: "2026-09-07T18:00" };

    expect(
      paramsFromFilters({ ...base, time: { preset: "7d", ...dates } }, 1).toString(),
    ).toBe("q=timeout&range=7d");
    expect(
      paramsFromFilters(
        { ...base, time: { preset: "custom", ...dates } },
        1,
      ).toString(),
    ).toBe("q=timeout&range=custom&from=2026-09-01T08%3A30&to=2026-09-07T18%3A00");
  });

  it("reads legacy date-time links as a custom range", () => {
    const filters = filtersFromParams(
      new URLSearchParams("q=x&from=2026-09-01T08:30&to=2026-09-07T18:00"),
    );

    expect(filters.time).toEqual({
      preset: "custom",
      from: "2026-09-01T08:30",
      to: "2026-09-07T18:00",
    });
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

function listResponse() {
  return {
    total_sessions: 1,
    page: 1,
    page_size: 20,
    has_more: false,
    items: [
      {
        session_pk: "019fcfff-ba46-7340-bd15-600791fe583f",
        session_id: "019fcfff-ba46-7340-bd15-600791fe583f",
        agent_name: "codex",
        agent_version: "0.8.1",
        host_name: "alice-mbp",
        platform: "macos",
        started_at: "2026-09-01T00:00:00Z",
        ended_at: null,
        last_activity_at: "2026-09-02T00:00:00Z",
        turns: 3,
        events: 12,
        total_tokens: 45000,
        title: "Draw a pelican",
        purpose: "title_generation",
      },
    ],
  };
}
