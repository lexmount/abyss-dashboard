import { RefreshCw } from "lucide-react";
import { Button } from "@lexmount.com/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

/** Refresh button with the time the shown data was last loaded. */
export function RefreshControl({
  refreshing,
  updatedAt,
  onRefresh,
}: {
  refreshing: boolean;
  /** Epoch milliseconds of the latest load, or 0 before any data arrives. */
  updatedAt: number;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="flex items-center gap-3">
      {updatedAt > 0 ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("dashboard.updatedAt", {
            time: new Intl.DateTimeFormat(locale, { timeStyle: "medium" }).format(
              updatedAt,
            ),
          })}
        </span>
      ) : null}
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
        {t("dashboard.refresh")}
      </Button>
    </div>
  );
}
