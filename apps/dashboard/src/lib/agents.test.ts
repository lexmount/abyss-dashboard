import { describe, expect, it } from "vitest";
import { agentDisplayName, agentFilterOptions, agentProductKey } from "./agents";

describe("agent display helpers", () => {
  it("exposes user-facing product filter options", () => {
    expect(agentFilterOptions).toEqual([
      { value: "claude-code", label: "Claude Code" },
      { value: "codex", label: "Codex" },
      { value: "cursor", label: "Cursor" },
      { value: "chatgpt", label: "ChatGPT" },
      { value: "openclaw", label: "OpenClaw" },
    ]);
  });

  it("folds Claude CLI and Desktop slugs into the Claude Code product", () => {
    expect(agentProductKey("claude")).toBe("claude-code");
    expect(agentProductKey("claude-code")).toBe("claude-code");
    expect(agentProductKey("claude-desktop")).toBe("claude-code");
    expect(agentDisplayName("claude-desktop")).toBe("Claude Code");
  });

  it("formats known product names for display", () => {
    expect(agentDisplayName("codex")).toBe("Codex");
    expect(agentDisplayName("chatgpt")).toBe("ChatGPT");
    expect(agentDisplayName("openclaw")).toBe("OpenClaw");
  });
});
