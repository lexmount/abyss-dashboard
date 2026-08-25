const agentProductLabels = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  chatgpt: "ChatGPT",
  openclaw: "OpenClaw",
} as const;

const agentProductAliases: Record<string, keyof typeof agentProductLabels> = {
  claude: "claude-code",
  "claude-code": "claude-code",
  "claude-desktop": "claude-code",
  codex: "codex",
  cursor: "cursor",
  chatgpt: "chatgpt",
  openclaw: "openclaw",
};

export const agentFilterOptions = [
  { value: "claude-code", label: agentProductLabels["claude-code"] },
  { value: "codex", label: agentProductLabels.codex },
] as const;

export function agentProductKey(agentName: string | null | undefined): string {
  const normalized = normalizeAgentName(agentName);
  return agentProductAliases[normalized] ?? normalized;
}

export function agentDisplayName(agentName: string | null | undefined): string {
  const productKey = agentProductKey(agentName);
  return (
    agentProductLabels[productKey as keyof typeof agentProductLabels] ?? productKey
  );
}

function normalizeAgentName(agentName: string | null | undefined): string {
  const normalized = agentName
    ?.trim()
    .toLocaleLowerCase()
    .replace(/[_\s]+/g, "-");
  return normalized && normalized.length > 0 ? normalized : "unknown";
}
