import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/i18n-context";
import { modelChoices } from "@/lib/usage-choices";
import { type DailyTokenUsageRow, type UsageEvent, type SummaryRow } from "@/api/usage";
import {
  chartRowsByDay,
  RawEventsTable,
  tokenChartDateWindow,
  UsageDashboard,
} from "./page";

const { fetchDayTokenUsageMock, fetchRawEventsMock, fetchUsageSummaryMock } =
  vi.hoisted(() => ({
    fetchDayTokenUsageMock: vi.fn(),
    fetchRawEventsMock: vi.fn(),
    fetchUsageSummaryMock: vi.fn(),
  }));

vi.mock("@/api/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/usage")>();
  return {
    ...actual,
    fetchDayTokenUsage: fetchDayTokenUsageMock,
    fetchRawEvents: fetchRawEventsMock,
    fetchUsageSummary: fetchUsageSummaryMock,
  };
});

vi.mock("@/components/layouts/base-layout", () => ({
  BaseLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("RawEventsTable", () => {
  beforeEach(() => {
    window.localStorage.setItem("abyss-ui-language", "en");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("links each event to its turn in the session's merged view", () => {
    renderRawEventsTable([
      {
        ...baseUsageEvent,
        session_pk: "session-response-pk",
        turn_index: 7,
      },
    ]);

    expect(screen.getByRole("columnheader", { name: "Turn" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Turn 7/ })).toHaveAttribute(
      "href",
      "/sessions/session-response-pk?turn=7",
    );
  });

  it("renders agent and device context columns without crowding the session cell", () => {
    renderRawEventsTable([
      {
        ...baseUsageEvent,
        agent_name: "codex",
        agent_version: "0.8.1",
        host_name: "alice-mbp",
        platform: "macos",
      },
    ]);

    expect(screen.getByRole("columnheader", { name: "Agent" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Platform / Host" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("0.8.1")).toBeInTheDocument();
    expect(screen.getByText("macos")).toBeInTheDocument();
    expect(screen.getByText("alice-mbp")).toBeInTheDocument();
  });

  it("renders Claude Desktop events under the Claude Code product name", () => {
    renderRawEventsTable([
      {
        ...baseUsageEvent,
        agent_name: "claude-desktop",
        agent_version: "Desktop/0.14.7",
      },
    ]);

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Desktop/0.14.7")).toBeInTheDocument();
  });

  it("shows unknown when the event host name is unavailable", () => {
    renderRawEventsTable([
      {
        ...baseUsageEvent,
        host_name: null,
      },
    ]);

    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});

describe("token chart rows", () => {
  it("fills missing days across the selected range", () => {
    const dateWindow = tokenChartDateWindow("7d", new Date(2026, 6, 1, 9, 18));
    const rows = chartRowsByDay(
      [
        {
          ...baseDailyTokenUsageRow,
          day: "2026-07-01",
          input_tokens: 687,
          output_tokens: 170,
          cache_read_tokens: 190_000,
          cache_write_tokens: 2_000,
          total_tokens: 192_857,
        },
      ],
      dateWindow,
    );

    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({
      day: "2026-06-25",
      input_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    });
    expect(rows[6]).toEqual({
      day: "2026-07-01",
      input_tokens: 687,
      cache_read_tokens: 190_000,
      cache_write_tokens: 2_000,
      output_tokens: 170,
      total_tokens: 192_857,
    });
  });
});

describe("tokenChartDateWindow", () => {
  it("splits the range into local days, ending today at now", () => {
    const now = new Date(2026, 6, 1, 9, 18);
    const { dayWindows, from, to } = tokenChartDateWindow("7d", now);

    expect(dayWindows.map((window) => window.day)).toEqual([
      "2026-06-25",
      "2026-06-26",
      "2026-06-27",
      "2026-06-28",
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
    ]);
    expect(dayWindows[0]).toEqual({
      day: "2026-06-25",
      from: new Date(2026, 5, 25).toISOString(),
      to: new Date(2026, 5, 26).toISOString(),
    });
    expect(dayWindows[6].to).toBe(now.toISOString());
    expect(from).toBe(new Date(2026, 5, 25).toISOString());
    expect(to).toBe(now.toISOString());
  });
});

describe("UsageDashboard", () => {
  beforeEach(() => {
    window.localStorage.setItem("abyss-ui-language", "en");
    fetchUsageSummaryMock.mockResolvedValue({
      from: null,
      to: null,
      group_by: [],
      rows: [],
      next_page_token: null,
    });
    fetchDayTokenUsageMock.mockImplementation(
      (_query: unknown, { day }: { day: string }) =>
        Promise.resolve({ ...baseDailyTokenUsageRow, day }),
    );
    fetchRawEventsMock.mockResolvedValue({ events: [], next_page_token: null });
  });

  afterEach(() => {
    cleanup();
    fetchUsageSummaryMock.mockReset();
    fetchDayTokenUsageMock.mockReset();
    fetchRawEventsMock.mockReset();
  });

  it("pages recent events through the backend", async () => {
    fetchUsageSummaryMock.mockResolvedValue({
      from: null,
      to: null,
      group_by: [],
      rows: [{ ...baseSummaryRow, requests: 13, responses: 12 }],
      next_page_token: null,
    });
    fetchRawEventsMock.mockImplementation(
      (_query: unknown, page: { limit: number; offset: number }) =>
        Promise.resolve({
          events: [{ ...baseUsageEvent, id: `event-${page.offset}` }],
          next_page_token: String(page.offset + page.limit),
        }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <I18nProvider>
            <UsageDashboard />
          </I18nProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 13 requests and 12 responses make 25 events, three pages of ten.
    expect(await screen.findByText("25 events in total.")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(fetchRawEventsMock).toHaveBeenLastCalledWith(expect.any(Object), {
      limit: 10,
      offset: 0,
    });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Go to next page" }));

    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    expect(fetchRawEventsMock).toHaveBeenLastCalledWith(expect.any(Object), {
      limit: 10,
      offset: 10,
    });
  });

  it("refreshes only today's chart point and keeps the chart in place", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <I18nProvider>
            <UsageDashboard />
          </I18nProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Seven days, one request each.
    await waitFor(() => expect(fetchDayTokenUsageMock).toHaveBeenCalledTimes(7));
    await waitFor(() =>
      expect(screen.queryByText("Loading usage chart...")).toBeNull(),
    );
    const summaryCalls = fetchUsageSummaryMock.mock.calls.length;

    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() =>
      expect(fetchUsageSummaryMock.mock.calls.length).toBe(summaryCalls + 1),
    );
    await waitFor(() => expect(fetchDayTokenUsageMock).toHaveBeenCalledTimes(8));
    expect(screen.queryByText("Loading usage chart...")).toBeNull();
    const today = tokenChartDateWindow("7d").dayWindows.at(-1)?.day;
    expect(fetchDayTokenUsageMock).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ day: today }),
    );
  });

  it("updates on its own every 30 seconds while in view, keeping the events page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchUsageSummaryMock.mockResolvedValue({
        from: null,
        to: null,
        group_by: [],
        rows: [{ ...baseSummaryRow, requests: 13, responses: 12 }],
        next_page_token: null,
      });
      fetchRawEventsMock.mockImplementation(
        (_query: unknown, page: { limit: number; offset: number }) =>
          Promise.resolve({
            events: [{ ...baseUsageEvent, id: `event-${page.offset}` }],
            next_page_token: String(page.offset + page.limit),
          }),
      );
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <I18nProvider>
              <UsageDashboard />
            </I18nProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await screen.findByText("Page 1 of 3");
      await waitFor(() => expect(fetchDayTokenUsageMock).toHaveBeenCalledTimes(7));
      expect(screen.getAllByText("Live")).toHaveLength(4);
      await userEvent
        .setup({ advanceTimers: vi.advanceTimersByTime })
        .click(screen.getByRole("button", { name: "Go to next page" }));
      await screen.findByText("Page 2 of 3");
      const summaryCalls = fetchUsageSummaryMock.mock.calls.length;

      await vi.advanceTimersByTimeAsync(30_000);

      await waitFor(() =>
        expect(fetchUsageSummaryMock.mock.calls.length).toBe(summaryCalls + 1),
      );
      // Only today's chart point reloads, and the reader stays on page 2.
      await waitFor(() => expect(fetchDayTokenUsageMock).toHaveBeenCalledTimes(8));
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
      expect(fetchRawEventsMock).toHaveBeenLastCalledWith(expect.any(Object), {
        limit: 10,
        offset: 10,
      });

      // A hidden page stops polling and says so.
      const visibility = vi
        .spyOn(document, "visibilityState", "get")
        .mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(await screen.findAllByText("Paused")).toHaveLength(4);
      await vi.advanceTimersByTimeAsync(90_000);
      expect(fetchUsageSummaryMock.mock.calls.length).toBe(summaryCalls + 1);
      visibility.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the compact filter grid without distribution or summary sections", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <I18nProvider>
            <UsageDashboard />
          </I18nProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("usage-filters-grid")).toHaveClass(
      "dashboard-filter-grid",
    );
    expect(await screen.findByText("Token Usage")).toBeInTheDocument();
    expect(screen.queryByText("Agent Distribution")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Summary" })).not.toBeInTheDocument();
    // The metric cards' summary also supplies the provider and model choices.
    await waitFor(() => expect(fetchUsageSummaryMock).toHaveBeenCalledTimes(1));
    expect(fetchUsageSummaryMock).toHaveBeenCalledWith(expect.any(Object));
  });

  it("shows cache reads and writes apart from input and output", async () => {
    fetchUsageSummaryMock.mockResolvedValue({
      from: null,
      to: null,
      group_by: [],
      rows: [
        {
          sessions: 1,
          turns: 2,
          requests: 2,
          responses: 2,
          input_tokens: 687,
          output_tokens: 170,
          cache_read_tokens: 190_000,
          cache_write_tokens: 2_000,
          reasoning_tokens: 40,
          total_tokens: 192_857,
        },
      ],
      next_page_token: null,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <I18nProvider>
            <UsageDashboard />
          </I18nProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("192,857")).toBeInTheDocument();
    expect(screen.getByText("Input").parentElement).toHaveTextContent("Input687");
    expect(screen.getByText("Output").parentElement).toHaveTextContent("Output170");
    expect(screen.getByText("Cache write").parentElement).toHaveTextContent(
      "Cache write2K",
    );
    expect(screen.getByText("Cache read").parentElement).toHaveTextContent(
      "Cache read190K",
    );
    expect(
      screen.getByLabelText("Cache read 190,000 · 98.5% of total"),
    ).toBeInTheDocument();
  });
});

function renderRawEventsTable(events: UsageEvent[]) {
  render(
    <MemoryRouter>
      <I18nProvider>
        <RawEventsTable events={events} loading={false} error={null} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

const baseUsageEvent: UsageEvent = {
  id: "event-request",
  event_id: "event-request",
  user_id: "user-1",
  device_context_id: "device-1",
  host_name: "alice-mbp",
  platform: "macos",
  session_pk: "session-pk",
  turn_pk: "turn-pk",
  agent_name: "codex",
  agent_version: null,
  session_id: "session-id",
  turn_index: 1,
  llm_provider: "openai",
  llm_model: "gpt-5",
  event_type: "request",
  text: "hello",
  text_sha256: null,
  input_tokens: 1,
  output_tokens: 2,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  reasoning_tokens: 0,
  total_tokens: 3,
  observed_at: "2026-07-01T00:00:00.000Z",
  metadata: null,
  attachments: [],
};

const baseDailyTokenUsageRow: DailyTokenUsageRow = {
  day: "2026-07-01",
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  total_tokens: 0,
};

describe("modelChoices", () => {
  it("lists models by token volume and keeps an unseen selection first", () => {
    const rows = [
      { ...baseSummaryRow, llm_model: "small", total_tokens: 10 },
      { ...baseSummaryRow, llm_model: "large", total_tokens: 500 },
      { ...baseSummaryRow, llm_model: "small", total_tokens: 20 },
    ];

    expect(modelChoices(rows, "")).toEqual(["large", "small"]);
    expect(modelChoices(rows, "retired")).toEqual(["retired", "large", "small"]);
  });
});

const baseSummaryRow: SummaryRow = {
  sessions: 1,
  turns: 1,
  requests: 1,
  responses: 1,
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  reasoning_tokens: 0,
  total_tokens: 0,
};
