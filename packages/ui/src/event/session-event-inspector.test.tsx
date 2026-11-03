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
  type SessionEventDetail,
  type SessionEventDetailState,
  type SessionEventHeader,
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

  it("shows the conversation and the recorded properties in groups", () => {
    const event = eventWithConversation(
      "response",
      {
        entries: [
          { role: "assistant", text: "complete response text" },
          { role: "tool_call", name: "exec", call_id: "call-1", text: "ls" },
        ],
        completeness: "complete",
      },
      {
        response_id: "resp_1",
        device: {
          host_name: "workstation",
          platform: "macos",
          os_version: null,
        },
      },
    );
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
    expect(sections()).toEqual([
      [
        "Call",
        ["Provider", "openai", "Model", "gpt-5", "Agent", "codex 0.9.0"],
      ],
      ["Usage", ["Output", "7", "Reasoning", "2", "Total", "9"]],
      ["Identifiers", ["event_id", "evt-1", "response_id", "resp_1"]],
      ["Device", ["Host", "workstation", "Platform", "macos"]],
    ]);
    // Internal keys are not shown.
    expect(screen.queryByText("event-1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the counters of a request, and another side's only when not zero", () => {
    renderInspector({
      status: "ready",
      event: eventWith("request", {
        token_usage: {
          input_tokens: 10,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 4,
          reasoning_tokens: 3,
          total_tokens: 17,
        },
      }),
    });
    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(sections().find(([title]) => title === "Usage")).toEqual([
      "Usage",
      [
        "Input",
        "10",
        "Cache read",
        "0",
        "Cache write",
        "4",
        "Reasoning",
        "3",
        "Total",
        "17",
      ],
    ]);
  });

  it("lists the declared ids among the identifiers", () => {
    renderInspector({
      status: "ready",
      event: eventWith("request", {
        previous_response_id: "resp_0",
        declared: {
          subagent_id: "agent-2",
          parent_subagent_id: null,
          turn_id: "turn-9",
        },
      }),
    });
    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(sections().find(([title]) => title === "Identifiers")).toEqual([
      "Identifiers",
      [
        "event_id",
        "evt-1",
        "previous_response_id",
        "resp_0",
        "subagent_id",
        "agent-2",
        "turn_id",
        "turn-9",
      ],
    ]);
  });

  it("embeds only the tabs, without the panel header, close, or resize", () => {
    render(
      <SessionEventInspector
        variant="embedded"
        detail={{
          status: "ready",
          event: eventWithConversation("request", {
            entries: [{ role: "user", text: "body" }],
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
      event: eventWithHeaders("request", null, [
        { name: "x-b", value: "2" },
        { name: "authorization", value: "<redacted>" },
        { name: "x-a", value: "1" },
        { name: "x-b", value: "3" },
        { name: "x-raw", value_base64: "/w==" },
        { name: "x-empty", value: "" },
      ]),
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
      event: eventWithHeaders("response", "/v1/messages?beta=true", [
        { name: "set-cookie", value: "<redacted>" },
        { name: "content-type", value: "text/event-stream" },
        { name: "set-cookie", value: "<redacted>" },
        { name: "x-raw", value_base64: "gA==" },
      ]),
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
    // The request's path is no header: it is among the properties.
    expect(
      within(screen.getByRole("tabpanel")).queryByText(
        "/v1/messages?beta=true",
      ),
    ).not.toBeInTheDocument();
  });

  it("lists the request path first among the properties, not the headers", () => {
    renderInspector({
      status: "ready",
      event: eventWithHeaders("request", "/v1/responses", []),
    });
    expect(
      screen.queryByRole("tab", { name: /Request headers/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    // The page shows the path nowhere else, so it leads.
    expect(sections()[0]).toEqual(["HTTP", ["Path", "/v1/responses"]]);
  });

  it("lists the call's purpose and the content left out with the call", () => {
    renderInspector({
      status: "ready",
      event: eventWith("request", {
        purpose: "session_title",
        omitted: ["tool_content", "images"],
      }),
    });
    expect(screen.queryByRole("tab", { name: "Metadata" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(sections()[0]).toEqual([
      "Call",
      [
        "Purpose",
        "session_title",
        "Omitted",
        "tool_content, images",
        "Provider",
        "openai",
        "Model",
        "gpt-5",
        "Agent",
        "codex 0.9.0",
      ],
    ]);
    // Neither shows, nor the empty HTTP group, when the event has none.
    expect(sections().map(([title]) => title)).not.toContain("HTTP");
  });

  it("hides the headers tab when the event has no headers", () => {
    renderInspector({
      status: "ready",
      event: eventWithHeaders("request", "/v1/responses", []),
    });
    expect(
      screen.queryByRole("tab", { name: /Request headers/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /Response headers/ }),
    ).not.toBeInTheDocument();
  });

  it("shows conversation entries in order with their roles", () => {
    renderInspector({
      status: "ready",
      event: eventWithConversation("request", {
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
      event: eventWithConversation("response", {
        entries: [{ role: "assistant", text: long }],
        completeness: "partial",
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
    const event = eventWithConversation(
      "request",
      {
        entries: [
          { role: "system", text: "be brief" },
          { role: "tool_result", text: long },
        ],
      },
      { http: { path: null, headers: [{ name: "x-a", value: "1" }] } },
    );
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
          event: eventWithHeaders("request", null, [
            { name: "x-a", value: "1" },
          ]),
        }}
      />,
    );

    expect(screen.getByText("Segment 2")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Content",
      "Facts",
      "Request headers (1)",
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
          event: eventWithHeaders("request", null, [
            { name: "x-a", value: "1" },
          ]),
        }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Request headers (1)" }));
    rerender(
      <SessionEventInspector
        {...props}
        detail={{
          status: "ready",
          event: eventWithConversation("response", {
            entries: [{ role: "assistant", text: "reply" }],
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
      event: eventWithConversation("request", { entries: [] }),
    });

    expect(screen.getByText("No text")).toBeInTheDocument();
  });
});

function eventWith(
  eventType: string,
  fields: Partial<SessionEventDetail> = {},
): SessionEventDetail {
  return {
    id: "event-1",
    event_id: "evt-1",
    event_type: eventType,
    observed_at: "2026-09-01T00:00:00Z",
    agent: { name: "codex", version: "0.9.0" },
    device: { host_name: null, platform: null, os_version: null },
    llm: { provider: "openai", model: "gpt-5" },
    purpose: null,
    declared: { subagent_id: null, parent_subagent_id: null, turn_id: null },
    response_id: null,
    previous_response_id: null,
    http: { path: null, headers: [] },
    token_usage: {
      input_tokens: 0,
      output_tokens: 7,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 2,
      total_tokens: 9,
    },
    omitted: [],
    attachments: [],
    ...fields,
  };
}

function eventWithHeaders(
  eventType: string,
  path: string | null,
  headers: SessionEventHeader[],
) {
  return eventWith(eventType, { http: { path, headers } });
}

function eventWithConversation(
  eventType: string,
  conversation: unknown,
  fields: Partial<SessionEventDetail> = {},
) {
  return eventWith(eventType, { ...fields, conversation });
}

/** Each properties section's title, and its labels and values in order. */
function sections(): [string, string[]][] {
  return Array.from(
    screen.getByRole("tabpanel").querySelectorAll<HTMLElement>("section"),
  ).map((section) => [
    section.querySelector("h3")?.textContent ?? "",
    Array.from(section.querySelectorAll("dt, dd")).map(
      (cell) => cell.textContent ?? "",
    ),
  ]);
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
  sectionCall: "Call",
  sectionUsage: "Usage",
  sectionIdentity: "Identifiers",
  sectionHttp: "HTTP",
  sectionDevice: "Device",
  agent: "Agent",
  provider: "Provider",
  model: "Model",
  purpose: "Purpose",
  omitted: "Omitted",
  inputTokens: "Input",
  cacheReadTokens: "Cache read",
  cacheWriteTokens: "Cache write",
  outputTokens: "Output",
  reasoningTokens: "Reasoning",
  totalTokens: "Total",
  path: "Path",
  hostName: "Host",
  platform: "Platform",
  osVersion: "OS version",
};

/** The rows of the headers tab, name and value each. */
function headerRows(): HTMLElement[] {
  return Array.from(
    screen.getByRole("tabpanel").querySelectorAll<HTMLElement>("dl > div"),
  );
}
