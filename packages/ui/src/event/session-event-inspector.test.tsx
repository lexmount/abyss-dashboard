import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

  it("shows the conversation and every scalar field", () => {
    const event = {
      id: "event-1",
      event_type: "response",
      llm_model: "gpt-5",
      observed_at: "2026-09-01T00:00:00Z",
      metadata: {
        conversation: {
          entries: [
            { role: "assistant", text: "complete response text" },
            { role: "tool_call", name: "exec", call_id: "call-1", text: "ls" },
          ],
          completeness: "complete",
        },
      },
      attachments: [],
      response_id: "resp_1",
      host_name: "workstation",
    };
    const onClose = vi.fn();
    renderInspector({ status: "ready", event }, onClose);

    expect(screen.getByText("Raw event")).toBeInTheDocument();
    expect(
      screen.getByText("gpt-5 · 2026-09-01T00:00:00Z"),
    ).toBeInTheDocument();
    expect(screen.getByText("complete response text")).toBeInTheDocument();
    expect(screen.getByText("exec")).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /^Tools/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(screen.getByText("response_id")).toBeInTheDocument();
    expect(screen.getByText("workstation")).toBeInTheDocument();
    expect(screen.queryByText("metadata")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("embeds only the tabs, without the panel header, close, or resize", () => {
    render(
      <SessionEventInspector
        variant="embedded"
        detail={{
          status: "ready",
          event: eventWithMetadata("request", {
            conversation: { entries: [{ role: "user", text: "body" }] },
          }),
        }}
        attachmentUrl={(id) => `/attachments/${id}`}
        formatDateTime={(value) => value}
        formatNumber={(value) => value.toString()}
        labels={labels}
      />,
    );

    expect(screen.getByText("body")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Content" })).toBeInTheDocument();
    expect(screen.queryByText("Raw event")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("lists request headers as recorded, in order and with duplicates", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderInspector({
      status: "ready",
      event: eventWithMetadata("request", {
        headers: [
          { name: "x-b", value: "2" },
          { name: "authorization", value: "<redacted>" },
          { name: "x-a", value: "1" },
          { name: "x-b", value: "3" },
          { name: "x-raw", value_base64: "/w==" },
          { name: "x-empty", value: "" },
        ],
      }),
    });

    fireEvent.click(screen.getByRole("tab", { name: "Request headers (6)" }));
    // By name, duplicates in recorded order.
    const items = headerRows();
    expect(items.map((item) => item.textContent)).toEqual([
      "authorization<redacted>",
      "x-a1",
      "x-b2",
      "x-b3",
      "x-empty",
      "x-raw/w== base64",
    ]);
    expect(within(items[5]).getByText("base64")).toBeInTheDocument();
    expect(within(items[0]).queryByText("base64")).not.toBeInTheDocument();

    // Raw, exactly as recorded.
    fireEvent.click(screen.getByRole("checkbox", { name: "Raw" }));
    expect(
      within(screen.getByRole("tabpanel")).getByText(/^x-b: 2/).textContent,
    ).toBe(
      [
        "x-b: 2",
        "authorization: <redacted>",
        "x-a: 1",
        "x-b: 3",
        "x-raw (base64): /w==",
        "x-empty: ",
      ].join("\n"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(
      [
        "x-b: 2",
        "authorization: <redacted>",
        "x-a: 1",
        "x-b: 3",
        "x-raw (base64): /w==",
        "x-empty: ",
      ].join("\n"),
    );
  });

  it("lists response headers the same way on a response event", () => {
    renderInspector({
      status: "ready",
      event: eventWithMetadata("response", {
        headers: [
          { name: "set-cookie", value: "<redacted>" },
          { name: "content-type", value: "text/event-stream" },
          { name: "set-cookie", value: "<redacted>" },
          { name: "x-raw", value_base64: "gA==" },
        ],
      }),
    });

    expect(
      screen.queryByRole("tab", { name: /Request headers/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Response headers (4)" }));
    const items = headerRows();
    expect(items.map((item) => item.textContent)).toEqual([
      "content-typetext/event-stream",
      "set-cookie<redacted>",
      "set-cookie<redacted>",
      "x-rawgA== base64",
    ]);
    expect(within(items[3]).getByText("base64")).toBeInTheDocument();
  });

  it("shows the metadata as a tree to open, or raw", () => {
    const long = "x".repeat(400);
    renderInspector({
      status: "ready",
      event: eventWithMetadata("request", {
        purpose: "prewarm",
        omitted: ["images"],
        conversation: {
          completeness: "complete",
          entries: Array.from({ length: 150 }, (_, index) => ({
            role: "user",
            text: index === 0 ? long : `t${index}`,
          })),
        },
      }),
    });
    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));
    const panel = screen.getByRole("tabpanel");
    // The root is open; what is under it is closed, with a preview.
    // The root's preview and its member line.
    expect(within(panel).getAllByText('"prewarm"')).toHaveLength(2);
    expect(panel).toHaveTextContent('omitted: (1) ["images"]');
    expect(panel).toHaveTextContent(
      'conversation: {completeness: "complete", entries: Array(150)}',
    );
    // Only in the preview: the member lines are not there yet.
    expect(within(panel).getAllByText("completeness")).toHaveLength(1);

    fireEvent.click(member(panel, "conversation"));
    fireEvent.click(member(panel, "entries"));
    // More than a hundred items come in ranges.
    expect(within(panel).getByText("[0 … 99]")).toBeInTheDocument();
    expect(within(panel).getByText("[100 … 149]")).toBeInTheDocument();
    fireEvent.click(within(panel).getByText("[0 … 99]"));
    fireEvent.click(member(panel, "0"));
    // A long string shows its start until opened.
    fireEvent.click(
      within(panel).getByRole("button", { name: "Show all 400" }),
    );
    expect(within(panel).getByText(JSON.stringify(long))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Raw" }));
    expect(within(panel).getByText(/"purpose": "prewarm"/)).toBeInTheDocument();
  });

  it("hides the headers tab when the event has no headers", () => {
    for (const metadata of [
      { conversation: [] },
      { headers: [] },
      // Superseded fields are not read.
      { request_headers: [{ name: "a", value: "1" }] },
      { response_headers: [{ name: "a", value: "1" }] },
    ]) {
      renderInspector({
        status: "ready",
        event: eventWithMetadata("request", metadata),
      });
      expect(
        screen.queryByRole("tab", { name: /Request headers/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: /Response headers/ }),
      ).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("shows conversation entries in order with their roles", () => {
    renderInspector({
      status: "ready",
      event: eventWithMetadata("request", {
        conversation: {
          entries: [
            { role: "system", text: "billing line" },
            { role: "developer", text: "You are Codex" },
            { role: "user", text: "count the lines" },
            { role: "system", text: "# Environment" },
            { role: "reasoning", text: "" },
            {
              role: "tool_call",
              call_id: "call_1",
              name: "Bash",
              text: '{"command":"wc -l notes.txt"}',
            },
            { role: "tool_result", call_id: "call_1", text: "2 notes.txt" },
            { role: "unknown", text: "agent message" },
            { role: "assistant", text: "It has 2 lines." },
            { role: "future_role", text: "kept" },
          ],
          completeness: "complete",
        },
      }),
    });

    const items = within(screen.getByRole("tabpanel")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "System promptbilling line",
      "System prompt · DeveloperYou are Codex",
      "Usercount the lines",
      "System# Environment",
      "ReasoningNo text",
      'Tool callBashCall ID: call_1{"command":"wc -l notes.txt"}',
      "Tool resultCall ID: call_12 notes.txt",
      "Unknownagent message",
      "AssistantIt has 2 lines.",
      "future_rolekept",
    ]);
    expect(screen.queryByText(/^Conversation /)).not.toBeInTheDocument();
  });

  it("collapses a long entry until it is expanded", () => {
    const long = Array.from({ length: 60 }, (_, line) => `line ${line}`).join(
      "\n",
    );
    renderInspector({
      status: "ready",
      event: eventWithMetadata("response", {
        conversation: {
          entries: [{ role: "assistant", text: long }],
          completeness: "partial",
        },
      }),
    });

    expect(screen.getByText("Conversation partial")).toBeInTheDocument();
    const entry = within(screen.getByRole("tabpanel")).getByRole("listitem");
    expect(entry).toHaveTextContent("line 19");
    expect(entry).not.toHaveTextContent("line 20");
    fireEvent.click(
      within(entry).getByRole("button", { name: `Show all ${long.length}` }),
    );
    expect(entry).toHaveTextContent("line 59");
    fireEvent.click(within(entry).getByRole("button", { name: "Show less" }));
    expect(entry).not.toHaveTextContent("line 59");
  });

  it("opens at the entry the reader chose, whole", () => {
    const long = Array.from({ length: 60 }, (_, line) => `line ${line}`).join(
      "\n",
    );
    const event = eventWithMetadata("request", {
      headers: [{ name: "x-a", value: "1" }],
      conversation: {
        entries: [
          { role: "system", text: "be brief" },
          { role: "tool_result", text: long },
        ],
      },
    });
    const { rerender } = renderInspector({ status: "ready", event });
    fireEvent.click(screen.getByRole("tab", { name: "Request headers (1)" }));

    const inspector = (request: number) => (
      <SessionEventInspector
        detail={{ status: "ready", event }}
        focusEntry={{ index: 1, request }}
        attachmentUrl={(id) => `/attachments/${id}`}
        formatDateTime={(value) => value}
        formatNumber={(value) => value.toString()}
        labels={labels}
      />
    );
    rerender(inspector(1));
    // Back on the content, the chosen entry marked and whole.
    const [first, chosen] = within(screen.getByRole("tabpanel")).getAllByRole(
      "listitem",
    );
    expect(first).not.toHaveAttribute("data-focused");
    expect(chosen).toHaveAttribute("data-focused");
    expect(chosen).toHaveTextContent("line 59");
  });

  it("adds a host's tabs after the content and keeps the chosen tab across events", () => {
    const tabs = [
      { id: "facts", label: "Facts", content: <p>derived facts</p> },
    ];
    const props = {
      heading: "Segment 2",
      extraTabs: tabs,
      attachmentUrl: (id: string) => `/attachments/${id}`,
      formatDateTime: (value: string) => value,
      formatNumber: (value: number) => value.toString(),
      labels,
    };
    const { rerender } = render(
      <SessionEventInspector
        {...props}
        detail={{
          status: "ready",
          event: eventWithMetadata("request", {
            headers: [{ name: "x-a", value: "1" }],
          }),
        }}
      />,
    );

    expect(screen.getByText("Segment 2")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Content",
      "Facts",
      "Request headers (1)",
      "Metadata",
      "Properties",
    ]);
    fireEvent.click(screen.getByRole("tab", { name: "Facts" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("derived facts");

    // Another event, still loading, keeps the host's tab.
    rerender(
      <SessionEventInspector {...props} detail={{ status: "loading" }} />,
    );
    expect(screen.getByRole("tab", { name: "Facts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("derived facts");

    // A tab the next event lacks shows its content instead.
    fireEvent.click(screen.getByRole("tab", { name: "Content" }));
    rerender(
      <SessionEventInspector
        {...props}
        detail={{
          status: "ready",
          event: eventWithMetadata("request", {
            headers: [{ name: "x-a", value: "1" }],
          }),
        }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Request headers (1)" }));
    rerender(
      <SessionEventInspector
        {...props}
        detail={{
          status: "ready",
          event: eventWithMetadata("response", {
            conversation: { entries: [{ role: "assistant", text: "reply" }] },
          }),
        }}
      />,
    );
    expect(screen.getByRole("tab", { name: "Content" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("reply");
  });

  it("says there is no text for events without entries", () => {
    renderInspector({
      status: "ready",
      event: eventWithMetadata("request", {
        conversation: { messages: [{ role: "user", text: "old shape" }] },
      }),
    });

    expect(screen.getByText("No text")).toBeInTheDocument();
    expect(screen.queryByText("old shape")).not.toBeInTheDocument();
  });
});

function eventWithMetadata(eventType: string, metadata: unknown) {
  return {
    id: "event-1",
    event_type: eventType,
    llm_model: "gpt-5",
    observed_at: "2026-09-01T00:00:00Z",
    metadata,
    attachments: [],
  };
}

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
  close: "Close",
  resize: "Resize",
  loading: "Loading",
  error: (message) => `Error ${message}`,
  copy: "Copy",
  noText: "No text",
  tabContent: "Content",
  tabAttachments: "Attachments",
  tabRequestHeaders: "Request headers",
  tabResponseHeaders: "Response headers",
  tabMetadata: "Metadata",
  tabProperties: "Properties",
  toolCall: "Tool call",
  toolResult: "Tool result",
  callId: "Call ID",
  imageContentHidden: "Image hidden",
  imageLabel: (index) => `Image ${index}`,
  openImage: (label) => `Open ${label}`,
  base64: "base64",
  raw: "Raw",
  roleSystem: "System",
  roleDeveloper: "Developer",
  roleUser: "User",
  roleAssistant: "Assistant",
  roleReasoning: "Reasoning",
  roleUnknown: "Unknown",
  systemPrompt: "System prompt",
  showMore: (count) => `Show all ${count}`,
  showLess: "Show less",
  incomplete: (completeness) => `Conversation ${completeness}`,
};

/** The rows of the headers tab, name and value each. */
function headerRows(): HTMLElement[] {
  return Array.from(
    screen.getByRole("tabpanel").querySelectorAll<HTMLElement>("dl > div"),
  );
}

/** The line of a tree member that opens it, by the member's key. */
function member(panel: HTMLElement, key: string): HTMLElement {
  return within(panel)
    .getAllByRole("button")
    .find((button) => button.textContent?.startsWith(`${key}: `))!;
}
