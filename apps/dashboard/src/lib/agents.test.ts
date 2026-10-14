import { describe, expect, it } from "vitest";
import { agentDisplayName, agentFilterOptions } from "./agents";

describe("agent display helpers", () => {
  it("labels each reported Agent on its own", () => {
    expect(agentDisplayName("claude-code")).toBe("Claude Code");
    expect(agentDisplayName("claude-desktop")).toBe("Claude Desktop");
    expect(agentDisplayName("codex")).toBe("Codex");
    expect(agentDisplayName("openclaw")).toBe("OpenClaw");
  });

  it("shows unlisted names exactly as reported", () => {
    expect(agentDisplayName("claude")).toBe("claude");
    expect(agentDisplayName("Some Agent")).toBe("Some Agent");
    expect(agentDisplayName("toString")).toBe("toString");
    expect(agentDisplayName(undefined)).toBe("unknown");
  });

  it("builds filter options from the names it is given", () => {
    expect(agentFilterOptions(["codex", "claude-desktop", "new-agent"])).toEqual([
      { value: "codex", label: "Codex" },
      { value: "claude-desktop", label: "Claude Desktop" },
      { value: "new-agent", label: "new-agent" },
    ]);
  });
});
