// Display labels for the Agent names abyss-rs reports. Names are shown and
// filtered exactly as the backend returns them; an unlisted name shows as is.
const agentLabels: Record<string, string> = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  codex: "Codex",
  openclaw: "OpenClaw",
};

export function agentDisplayName(agentName: string | null | undefined): string {
  if (!agentName) {
    return "unknown";
  }
  return Object.hasOwn(agentLabels, agentName) ? agentLabels[agentName] : agentName;
}

/** Filter options for the Agent names seen in the data, labelled for display. */
export function agentFilterOptions(
  agentNames: readonly string[],
): { value: string; label: string }[] {
  return agentNames.map((value) => ({ value, label: agentDisplayName(value) }));
}
