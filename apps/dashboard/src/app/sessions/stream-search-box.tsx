import * as React from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { TextRange } from "@/api/usage";
import { useI18n } from "@/hooks/use-i18n";
import { highlightSegments } from "@/lib/stream-search";
import { cn } from "@/lib/utils";

/**
 * The session's search field, with the position of the match being viewed
 * and previous / next controls. Enter steps forward, Shift + Enter back, and
 * Escape clears the field.
 */
export function StreamSearchBox({
  query,
  onQueryChange,
  status,
  position,
  total,
  truncated,
  onStep,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  /** Shown instead of the position while the session's text is not searchable yet. */
  status: string | null;
  /** 1-based position of the match being viewed, or 0 for none. */
  position: number;
  total: number;
  /** The search found more than it returned, so `total` is a lower bound. */
  truncated: boolean;
  onStep: (delta: number) => void;
}) {
  const { t, formatNumber } = useI18n();
  const hasQuery = query.trim().length > 0;
  return (
    <div className="border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 bg-card flex h-8 w-full items-center gap-1.5 rounded-md border pr-1 pl-2.5 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]">
      <Search className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      <input
        value={query}
        maxLength={256}
        placeholder={t("sessions.streams.search")}
        aria-label={t("sessions.streams.search")}
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape" && hasQuery) {
            event.preventDefault();
            onQueryChange("");
          }
        }}
      />
      {hasQuery ? (
        <>
          <span
            className="text-muted-foreground shrink-0 text-xs tabular-nums"
            aria-live="polite"
          >
            {status ??
              (total > 0
                ? t("sessions.streams.searchPosition", {
                    current: formatNumber(position),
                    total: `${formatNumber(total)}${truncated ? "+" : ""}`,
                  })
                : t("sessions.streams.searchNoMatches"))}
          </span>
          <SearchIconButton
            label={t("sessions.streams.searchPrevious")}
            disabled={total === 0}
            onClick={() => onStep(-1)}
          >
            <ChevronUp className="size-3.5" />
          </SearchIconButton>
          <SearchIconButton
            label={t("sessions.streams.searchNext")}
            disabled={total === 0}
            onClick={() => onStep(1)}
          >
            <ChevronDown className="size-3.5" />
          </SearchIconButton>
          <SearchIconButton
            label={t("sessions.streams.searchClear")}
            onClick={() => onQueryChange("")}
          >
            <X className="size-3.5" />
          </SearchIconButton>
        </>
      ) : null}
    </div>
  );
}

function SearchIconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * Text with the search's ranges in it marked; the occurrence being viewed is
 * filled solid so it stands out among the others.
 */
export function Highlighted({
  text,
  ranges,
  active,
}: {
  text: string;
  /** Where the query is in the text, from the search; none outside a search. */
  ranges?: readonly TextRange[];
  /** Index of the occurrence being viewed among the ranges, if any. */
  active?: number;
}) {
  if (!ranges || ranges.length === 0) {
    return <>{text}</>;
  }
  return (
    <>
      {highlightSegments(text, ranges).map((segment, index) => {
        if (segment.range === null) {
          return <React.Fragment key={index}>{segment.text}</React.Fragment>;
        }
        const current = segment.range === active;
        return (
          <mark
            key={index}
            data-active-match={current ? "" : undefined}
            className={cn(
              "rounded-sm px-px",
              current ? "bg-ring text-background" : "bg-ring/25 text-foreground",
            )}
          >
            {segment.text}
          </mark>
        );
      })}
    </>
  );
}

/** The value once it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
