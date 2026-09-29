import type { SummaryRow } from "@/api/usage";

/** Values of one summary field ordered by token volume, busiest first. */
function busiestFirst(
  rows: SummaryRow[],
  pick: (row: SummaryRow) => string | undefined,
  selected: string,
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
  // Keep the current choice listed even when the scope no longer includes it.
  return selected && !totals.has(selected) ? [selected, ...values] : values;
}

/** Models seen in scope, busiest first, keeping the current choice listed. */
export function modelChoices(rows: SummaryRow[], selected: string): string[] {
  return busiestFirst(rows, (row) => row.llm_model, selected);
}

/** Providers seen in scope, busiest first, keeping the current choice listed. */
export function providerChoices(rows: SummaryRow[], selected: string): string[] {
  return busiestFirst(rows, (row) => row.llm_provider, selected);
}
