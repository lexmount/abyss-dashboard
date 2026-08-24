import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SessionTimeline,
  type SessionTimelineLabels,
  type SessionTimelineViewModel,
} from "./session-timeline";

describe("SessionTimeline", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("hides endpoint identifiers for a shared session", () => {
    renderTimeline(false);

    expect(screen.getByText("shared prompt")).toBeInTheDocument();
    expect(screen.queryByText("session-internal-pk")).not.toBeInTheDocument();
    expect(screen.queryByText("device-internal-id")).not.toBeInTheDocument();
  });

  it("retains endpoint identifiers on the owner's session page", () => {
    renderTimeline(true);

    expect(screen.getByText("session-internal-pk")).toBeInTheDocument();
    expect(screen.getByText("device-internal-id")).toBeInTheDocument();
  });

  it("renders structured Codex tool calls and results", () => {
    renderTimeline(true);

    expect(screen.getByText("Tool call")).toBeInTheDocument();
    expect(screen.getByText("Tool result")).toBeInTheDocument();
    expect(screen.getByText("exec")).toBeInTheDocument();
    expect(screen.getAllByText(/Call ID: call-1/)).toHaveLength(2);
    expect(screen.getByText('{"cmd":"pwd"}')).toBeInTheDocument();
    expect(screen.getByText("workspace path")).toBeInTheDocument();
  });

  it("constrains long tool content to a scrollable viewport", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const longOutput = Array.from(
      { length: 13 },
      (_, index) => `tool output line ${index + 1}`,
    ).join("\n");
    const longToolTimeline = structuredClone(timeline);
    const metadata = longToolTimeline.turns[0].events[0].metadata as {
      content_segments: Array<{ output?: string }>;
    };
    metadata.content_segments[1].output = longOutput;

    renderTimeline(true, longToolTimeline);

    const scrollArea = screen
      .getByText(/tool output line 13/)
      .closest('[data-slot="scroll-area"]');
    expect(scrollArea).toHaveClass("h-72");
    expect(
      scrollArea?.querySelector('[data-slot="scroll-area-viewport"]'),
    ).toBeInTheDocument();
    expect(
      scrollArea?.querySelector('[data-slot="scroll-area-scrollbar"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('{"cmd":"pwd"}').closest('[data-slot="scroll-area"]'),
    ).toBeNull();
  });

  it("preserves the authoritative backend order for tied event timestamps", () => {
    renderTimeline(true);

    const request = screen.getByText("shared prompt");
    const response = screen.getByText("shared response");
    expect(
      request.compareDocumentPosition(response) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("marks estimated Claude Desktop token usage", () => {
    const estimatedTimeline = structuredClone(timeline);
    const metadata = estimatedTimeline.turns[0].events[0].metadata as Record<
      string,
      unknown
    >;
    estimatedTimeline.turns[0].events[0].metadata = {
      ...metadata,
      token_usage_estimated: true,
      token_usage_source: "estimated_visible_content",
    };

    renderTimeline(true, estimatedTimeline);

    expect(
      screen.getByTitle("Token count estimated from visible content"),
    ).toHaveTextContent("≈ 12 tokens");
  });

  it("renders authorized image attachments and usage-only placeholders", () => {
    renderTimeline(true);

    const image = screen.getByRole("img", { name: "Image 1" });
    expect(image).toHaveAttribute(
      "src",
      "/api/v1/agent-usage/attachments/attachment-image-1",
    );
    expect(
      screen.getByRole("link", { name: "Open full-size Image 1" }),
    ).toHaveAttribute(
      "href",
      "/api/v1/agent-usage/attachments/attachment-image-1",
    );
    expect(screen.getByText("1,024 B")).toBeInTheDocument();
    expect(
      screen.getByText("Image content hidden by audit policy"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    for (const mediaType of [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]) {
      expect(screen.getByText(mediaType)).toBeInTheDocument();
    }
  });
});

function renderTimeline(
  showInternalIdentifiers: boolean,
  value: SessionTimelineViewModel = timeline,
) {
  render(
    <SessionTimeline
      attachmentUrl={(attachmentId) =>
        `/api/v1/agent-usage/attachments/${attachmentId}`
      }
      formatAgentName={(agentName) => agentName}
      formatDateTime={(dateTime) => dateTime}
      formatNumber={(number) => new Intl.NumberFormat("en-US").format(number)}
      labels={labels}
      timeline={value}
      showInternalIdentifiers={showInternalIdentifiers}
    />,
  );
}

const labels: SessionTimelineLabels = {
  agent: "Agent",
  callId: "Call ID",
  deviceContext: "Device context",
  ended: (time) => ` · Ended ${time}`,
  estimatedTokens: "Token count estimated from visible content",
  image: "Image",
  imageContentHidden: "Image content hidden by audit policy",
  imageLabel: (index) => `Image ${index}`,
  noEvents: "No events",
  noText: "No text",
  noTurns: "No turns",
  openImage: (label) => `Open full-size ${label}`,
  request: "Request",
  response: "Response",
  sessionPk: "Session PK",
  started: (time) => `Started ${time}`,
  timeline: "Timeline",
  tokens: "tokens",
  toolCall: "Tool call",
  toolContentHidden: "Tool content hidden",
  toolResult: "Tool result",
  turn: (index) => `Turn ${index}`,
  turns: (count) => `${count} turns`,
  version: "Version",
};

const timeline: SessionTimelineViewModel = {
  session: {
    session_pk: "session-internal-pk",
    device_context_id: "device-internal-id",
    agent_name: "codex",
    agent_version: "0.145.0",
    session_id: "shared-session",
    started_at: "2026-07-31T00:00:00Z",
    ended_at: "2026-07-31T00:01:00Z",
  },
  turns: [
    {
      turn_pk: "turn-internal-pk",
      turn_index: 1,
      started_at: "2026-07-31T00:00:00Z",
      ended_at: "2026-07-31T00:01:00Z",
      events: [
        {
          id: "event-internal-pk",
          event_type: "request",
          llm_provider: "openai",
          llm_model: "gpt-5",
          text: "shared prompt",
          total_tokens: 12,
          observed_at: "2026-07-31T00:00:00Z",
          metadata: {
            response_id: "resp-shared",
            provider_call_index: 1,
            content_segments: [
              {
                type: "tool_call",
                item_id: "ctc-1",
                call_id: "call-1",
                name: "exec",
                input: '{"cmd":"pwd"}',
              },
              {
                type: "tool_result",
                call_id: "call-1",
                output: "workspace path",
              },
            ],
          },
          attachments: [
            {
              id: "attachment-image-1",
              position: 0,
              media_type: "image/png",
              byte_size: 1024,
              sha256: "a".repeat(64),
              content_available: true,
            },
            {
              id: "attachment-image-2",
              position: 1,
              media_type: "image/jpeg",
              byte_size: 2048,
              sha256: "b".repeat(64),
              content_available: false,
            },
            {
              id: "attachment-image-3",
              position: 2,
              media_type: "image/webp",
              byte_size: 4096,
              sha256: "c".repeat(64),
              content_available: true,
            },
            {
              id: "attachment-image-4",
              position: 3,
              media_type: "image/gif",
              byte_size: 8192,
              sha256: "d".repeat(64),
              content_available: true,
            },
          ],
        },
        {
          id: "event-response-pk",
          event_type: "response",
          llm_provider: "openai",
          llm_model: "gpt-5",
          text: "shared response",
          total_tokens: 3,
          observed_at: "2026-07-31T00:00:00Z",
          metadata: {
            response_id: "resp-shared",
            provider_call_index: 1,
          },
          attachments: [],
        },
      ],
    },
  ],
};
