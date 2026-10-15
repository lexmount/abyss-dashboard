import { filterValueList, type FilterValues, type SummaryRow } from "@/api/usage";

/** Values of one summary field ordered by token volume, busiest first. */
function busiestFirst(
  rows: SummaryRow[],
  pick: (row: SummaryRow) => string | undefined,
  selected: FilterValues,
): string[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const value = pick(row);
    if (value) {
      totals.set(value, (totals.get(value) ?? 0) + row.total_tokens);
    }
  }
  const values = [...totals.keys()].sort(
    (left, right) => (totals.get(right) ?? 0) - (totals.get(left) ?? 0),
  );
  // Keep current choices listed even when the scope no longer includes them.
  const unseen = filterValueList(selected).filter((value) => !totals.has(value));
  return [...unseen, ...values];
}

/** Agents seen in scope, busiest first, keeping current choices listed. */
export function agentChoices(rows: SummaryRow[], selected: FilterValues): string[] {
  return busiestFirst(rows, (row) => row.agent_name, selected);
}

/** Rows of the selected Agents, or every row when none is selected. */
export function rowsOfAgents(rows: SummaryRow[], agentNames: string[]): SummaryRow[] {
  return agentNames.length > 0
    ? rows.filter(
        (row) => row.agent_name !== undefined && agentNames.includes(row.agent_name),
      )
    : rows;
}

/** Models seen in scope, busiest first, keeping current choices listed. */
export function modelChoices(rows: SummaryRow[], selected: FilterValues): string[] {
  return busiestFirst(rows, (row) => row.llm_model, selected);
}

/** Providers seen in scope, busiest first, keeping current choices listed. */
export function providerChoices(rows: SummaryRow[], selected: FilterValues): string[] {
  return busiestFirst(rows, (row) => row.llm_provider, selected);
}
