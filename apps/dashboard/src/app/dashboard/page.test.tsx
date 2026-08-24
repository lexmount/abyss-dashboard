import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/i18n-context";
import { type DailyTokenUsageRow, type UsageEvent } from "@/api/usage";
import { chartRowsByDay, RawEventsTable, tokenChartDateWindow } from "./page";

describe("RawEventsTable", () => {
  beforeEach(() => {
    window.localStorage.setItem("abyss-ui-language", "en");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("links response text previews to the full session detail when the popover content overflows", async () => {
    mockPreviewOverflow(true);

    renderRawEventsTable([
      {
        ...baseUsageEvent,
        id: "event-response",
        event_id: "event-response",
        event_type: "response",
        session_pk: "session-response-pk",
        text: JSON.stringify({
          risk_level: "low",
          user_authorization: "high",
          outcome: "allow",
          rationale:
            "The response is long enough to need inspection but shorter than the hard preview limit.",
        }),
      },
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Show event text" }));

    const sessionDetailLink = await screen.findByRole("link", {
      name: /View full text in Session Detail/i,
    });
    expect(sessionDetailLink).toHaveAttribute("href", "/sessions/session-response-pk");
    expect(
      screen.getByText("Preview truncated. Open Session Detail to view the full text."),
    ).toBeInTheDocument();
  });

  it("does not show a session detail link when the popover content fits", async () => {
    mockPreviewOverflow(false);

    renderRawEventsTable([
      {
        ...baseUsageEvent,
        text: "short text",
      },
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Show event text" }));

    expect(
      screen.queryByRole("link", {
        name: /View full text in Session Detail/i,
      }),
    ).not.toBeInTheDocument();
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
          input_tokens: 192_687,
          total_tokens: 192_857,
        },
      ],
      dateWindow,
    );

    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({
      day: "2026-06-25",
      input_tokens: 0,
      total_tokens: 0,
    });
    expect(rows[6]).toEqual({
      day: "2026-07-01",
      input_tokens: 192_687,
      total_tokens: 192_857,
    });
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

function mockPreviewOverflow(overflows: boolean) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(
    overflows ? 640 : 320,
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(560);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(20);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(20);
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
  total_tokens: 0,
};
