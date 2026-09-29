import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SessionEventInspector,
  type SessionEventDetailState,
  type SessionEventInspectorLabels,
} from "./session-event-inspector";

describe("SessionEventInspector", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows loading until the raw event arrives", () => {
    renderInspector({ status: "loading" });

    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("shows the recorded text, tool segments, and every scalar field", () => {
    const event = {
      id: "event-1",
      event_type: "response",
      turn_index: 3,
      llm_model: "gpt-5",
      observed_at: "2026-09-01T00:00:00Z",
      text: "complete response text",
      metadata: {
        content_segments: [
          { type: "tool_call", name: "exec", call_id: "call-1", input: "ls" },
        ],
      },
      attachments: [],
      text_sha256: "abc123",
      host_name: "workstation",
    };
    const onClose = vi.fn();
    renderInspector({ status: "ready", event }, onClose);

    expect(screen.getByText("Turn 3")).toBeInTheDocument();
    expect(screen.getByText("complete response text")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Tools (1)" }));
    expect(screen.getByText("exec")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(screen.getByText("text_sha256")).toBeInTheDocument();
    expect(screen.getByText("workstation")).toBeInTheDocument();
    expect(screen.queryByText("metadata")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

function renderInspector(
  detail: SessionEventDetailState,
  onClose: () => void = vi.fn(),
) {
  return render(
    <SessionEventInspector
      detail={detail}
      onClose={onClose}
      attachmentUrl={(id) => `/attachments/${id}`}
      formatDateTime={(value) => value}
      formatNumber={(value) => value.toString()}
      labels={labels}
    />,
  );
}

const labels: SessionEventInspectorLabels = {
  title: "Raw event",
  request: "Request",
  response: "Response",
  turn: (index) => `Turn ${index}`,
  close: "Close",
  resize: "Resize",
  loading: "Loading",
  error: (message) => `Error ${message}`,
  copy: "Copy",
  noText: "No text",
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
