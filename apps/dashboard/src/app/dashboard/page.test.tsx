import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/i18n-context";
import { type DailyTokenUsageRow, type UsageEvent } from "@/api/usage";
import {
  chartRowsByDay,
  RawEventsTable,
  tokenChartDateWindow,
  UsageDashboard,
} from "./page";

const { fetchDailyTokenUsageMock, fetchRawEventsMock, fetchUsageSummaryMock } =
  vi.hoisted(() => ({
    fetchDailyTokenUsageMock: vi.fn(),
    fetchRawEventsMock: vi.fn(),
    fetchUsageSummaryMock: vi.fn(),
  }));

vi.mock("@/api/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/usage")>();
  return {
    ...actual,
    fetchDailyTokenUsage: fetchDailyTokenUsageMock,
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
    const dateWindow = tokenChartDateWindow("7d", new Date("2026-07-01T16:18:00.000Z"));
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
    fetchDailyTokenUsageMock.mockResolvedValue({
      from: null,
      to: null,
      group_by: ["day"],
      rows: [],
      next_page_token: null,
    });
    fetchRawEventsMock.mockResolvedValue({ events: [], next_page_token: null });
  });

  afterEach(() => {
    cleanup();
    fetchUsageSummaryMock.mockReset();
    fetchDailyTokenUsageMock.mockReset();
    fetchRawEventsMock.mockReset();
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
