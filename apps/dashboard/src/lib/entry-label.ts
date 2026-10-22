import type { EntryLabel } from "@/api/usage";

/** Preserves the captured text; callers apply single-line layout with CSS. */
export function entryLabelText(label: EntryLabel | null | undefined): string | null {
  if (label == null) return null;
  return label.length > label.text.length ? `${label.text}…` : label.text;
}
