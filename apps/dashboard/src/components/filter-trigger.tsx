import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Popover trigger that matches the shared SelectTrigger, so custom filter
 * pickers sit in the filter grid without looking like action buttons.
 */
export function FilterTrigger({
  className,
  children,
  hideChevron = false,
  ...props
}: React.ComponentProps<"button"> & { hideChevron?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-left text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <ChevronDown
        className={cn(
          "text-muted-foreground size-4 shrink-0 opacity-50",
          hideChevron && "invisible",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
