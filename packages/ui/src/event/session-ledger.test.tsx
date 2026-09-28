import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adjacentEventRowIndex,
  buildLedgerRows,
  neighborEventIds,
  requestNumbers,
  SessionLedger,
  type SessionLedgerDetailState,
  type SessionLedgerEvent,
  type SessionLedgerLabels,
  type SessionLedgerOutline,
} from "./session-ledger";

describe("session ledger model", () => {
  const turns = outline().turns;

  it("numbers requests across turns in outline order", () => {
    expect([...requestNumbers(turns)]).toEqual([
      ["req-1", 1],
      ["req-2", 2],
      ["req-3", 3],
    ]);
  });

  it("keeps only turn headers for collapsed turns and applies the type filter", () => {
    const numbers = requestNumbers(turns);
    const rows = buildLedgerRows(turns, {
      filter: "response",
      collapsedTurns: new Set([2]),
      numbers,
    });

    expect(
      rows.map((row) =>
        row.kind === "turn" ? `turn-${row.turn.turn_index}` : row.event.id,
      ),
    ).toEqual(["turn-1", "res-1", "res-2", "turn-2"]);
  });

  it("steps between event rows and skips turn headers", () => {
    const rows = buildLedgerRows(turns, {
      filter: "all",
      collapsedTurns: new Set(),
      numbers: requestNumbers(turns),
    });
    const next = adjacentEventRowIndex(rows, "res-2", 1);

    expect(next === null ? null : rows[next]).toMatchObject({
      kind: "event",
      event: { id: "req-3" },
    });
    expect(adjacentEventRowIndex(rows, null, 1)).toBe(1);
    expect(adjacentEventRowIndex(rows, "req-1", -1)).toBeNull();
  });

  it("finds neighbors across turn boundaries", () => {
    expect(neighborEventIds(turns, "res-2")).toEqual(["req-2", "req-3"]);
    expect(neighborEventIds(turns, "missing")).toEqual([]);
  });
});

describe("SessionLedger", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("selects events and shows the loaded content in the inspector", () => {
    const onSelectEvent = vi.fn();
    const { rerender } = renderLedger({ onSelectEvent });

    fireEvent.click(screen.getByText("response one"));
    expect(onSelectEvent).toHaveBeenCalledWith("res-1");

    rerender(
      ledger({
        onSelectEvent,
        selectedEventId: "res-1",
        detail: {
          status: "ready",
          event: {
            id: "res-1",
            text: "complete response text",
            metadata: {
              content_segments: [
                {
                  type: "tool_call",
                  name: "exec",
                  call_id: "call-1",
                  input: "ls",
                },
              ],
            },
            attachments: [],
          },
        },
      }),
    );
    expect(screen.getByText("complete response text")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Tools (1)" }));
    expect(screen.getByText("exec")).toBeInTheDocument();
  });

  it("moves the selection with the keyboard and closes on Escape", () => {
    const onSelectEvent = vi.fn();
    renderLedger({ onSelectEvent, selectedEventId: "req-1" });
    const list = screen.getByRole("listbox");

    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(onSelectEvent).toHaveBeenLastCalledWith("res-1");

    fireEvent.keyDown(list, { key: "Escape" });
    expect(onSelectEvent).toHaveBeenLastCalledWith(null);
  });

  it("lists outline properties while content is still loading", () => {
    renderLedger({ selectedEventId: "req-1" });

    expect(screen.getByText("Loading")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(screen.getByText("input_tokens")).toBeInTheDocument();
    expect(screen.getByText("llm_model")).toBeInTheDocument();
  });

  it("lists every scalar field of the loaded event", () => {
    const loaded = {
      id: "req-1",
      text: "prompt",
      metadata: {},
      attachments: [],
      text_sha256: "abc123",
      host_name: "workstation",
    };
    renderLedger({
      selectedEventId: "req-1",
      detail: { status: "ready", event: loaded },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(screen.getByText("text_sha256")).toBeInTheDocument();
    expect(screen.getByText("workstation")).toBeInTheDocument();
    expect(screen.queryByText("preview")).not.toBeInTheDocument();
  });
});

function renderLedger(
  props: Partial<Parameters<typeof ledger>[0]> = {},
): ReturnType<typeof render> {
  // jsdom has no layout, so give the virtualized list a measurable viewport.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 1200,
    height: 800,
    top: 0,
    left: 0,
    right: 1200,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1200);
  return render(ledger(props));
}

function ledger({
  onSelectEvent = vi.fn(),
  selectedEventId = null,
  detail = { status: "loading" },
}: {
  onSelectEvent?: (eventId: string | null) => void;
  selectedEventId?: string | null;
  detail?: SessionLedgerDetailState;
}) {
  return (
    <SessionLedger
      outline={outline()}
      selectedEventId={selectedEventId}
      onSelectEvent={onSelectEvent}
      detail={detail}
      attachmentUrl={(id) => `/attachments/${id}`}
      formatDateTime={(value) => value}
      formatTime={(value) => value}
      formatNumber={(value) => value.toString()}
      labels={labels}
    />
  );
}

function outline(): SessionLedgerOutline {
  return {
    session: {
      agent_name: "codex",
      agent_version: null,
      session_id: "session-1",
      started_at: "2026-09-01T00:00:00Z",
      ended_at: null,
    },
    turns: [
      {
        turn_index: 1,
        started_at: "2026-09-01T00:00:00Z",
        ended_at: null,
        events: [
          event("req-1", "request", "request one"),
          event("res-1", "response", "response one"),
          event("req-2", "request", "request two"),
          event("res-2", "response", null),
        ],
      },
      {
        turn_index: 2,
        started_at: "2026-09-01T00:01:00Z",
        ended_at: null,
        events: [
          event("req-3", "request", "request three"),
          event("res-3", "response", "response three"),
        ],
      },
    ],
  };
}

function event(
  id: string,
  eventType: "request" | "response",
  preview: string | null,
): SessionLedgerEvent {
  return {
    id,
    event_type: eventType,
    llm_provider: "openai",
    llm_model: "gpt-5",
    input_tokens: 10,
    output_tokens: 2,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 12,
    token_usage_estimated: false,
    observed_at: "2026-09-01T00:00:00Z",
    text_chars: preview?.length ?? 0,
    preview,
    attachment_count: 0,
  };
}

const labels: SessionLedgerLabels = {
  all: "All",
  request: "Request",
  response: "Response",
  requestNumber: (number) => `#${number}`,
  turn: (index) => `Turn ${index}`,
  turnSummary: (events, input, output) => `${events} events ${input} ${output}`,
  sessionSummary: (turns, events, requests) =>
    `${turns} turns ${events} events ${requests} requests`,
  collapseAll: "Collapse all",
  expandAll: "Expand all",
  filter: "Filter",
  noText: "No text",
  noTurns: "No turns",
  characters: (count) => `${count} chars`,
  tokens: (count) => `${count} tok`,
  estimatedTokens: "Estimated",
  close: "Close",
  resize: "Resize",
  loading: "Loading",
  error: (message) => `Error ${message}`,
  copy: "Copy",
  tabContent: "Content",
  tabTools: "Tools",
  tabAttachments: "Attachments",
  tabMetadata: "Metadata",
  tabProperties: "Properties",
  noTools: "No tools",
  toolCall: "Tool call",
  toolResult: "Tool result",
  callId: "Call ID",
  toolContentHidden: "Hidden",
  imageContentHidden: "Image hidden",
  imageLabel: (index) => `Image ${index}`,
  openImage: (label) => `Open ${label}`,
};
