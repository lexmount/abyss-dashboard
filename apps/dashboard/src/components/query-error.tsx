import { KeyRound, RotateCw, SearchX, TriangleAlert, Unplug } from "lucide-react";
import { Button, Card, CardContent } from "@lexmount.com/abyss-ui";
import { apiErrorDetail, apiErrorKind, type ApiErrorKind } from "@/api/http";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

const kindIcons: Record<ApiErrorKind, typeof Unplug> = {
  unreachable: Unplug,
  unauthorized: KeyRound,
  notFound: SearchX,
  server: TriangleAlert,
};

interface QueryErrorProps {
  error: unknown;
  /** Refetches the failed data; without it no retry button is shown. */
  onRetry?: () => void;
  retrying?: boolean;
  /** Replaces the generic title, e.g. "Session not found" for a 404. */
  title?: string;
  className?: string;
}

/**
 * A failed request explained by what the reader can do about it, with the
 * raw error kept as a quiet detail line.
 */
function QueryErrorBody({ error, onRetry, retrying = false, title }: QueryErrorProps) {
  const { t } = useI18n();
  const kind = apiErrorKind(error);
  const Icon = kindIcons[kind];
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Icon className="size-5" />
      </div>
      <div className="grid gap-1">
        <p className="text-sm font-medium">{title ?? t(`error.${kind}.title`)}</p>
        <p className="text-muted-foreground max-w-lg text-sm">
          {t(`error.${kind}.description`)}
        </p>
      </div>
      <p className="text-muted-foreground/80 max-w-lg font-mono text-xs break-all">
        {apiErrorDetail(error)}
      </p>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={onRetry}
          disabled={retrying}
        >
          <RotateCw className={cn("size-4", retrying && "animate-spin")} />
          {t("error.retry")}
        </Button>
      ) : null}
    </div>
  );
}

/** A failed page section, as a card of its own. */
export function QueryErrorCard({ className, ...props }: QueryErrorProps) {
  return (
    <Card className={className}>
      <CardContent>
        <QueryErrorBody {...props} />
      </CardContent>
    </Card>
  );
}

/**
 * One row above sections that each show a quiet placeholder, for pages where
 * several requests fail for the same reason.
 */
export function QueryErrorBanner({
  error,
  onRetry,
  retrying = false,
  title,
  className,
}: QueryErrorProps) {
  const { t } = useI18n();
  const kind = apiErrorKind(error);
  const Icon = kindIcons[kind];
  return (
    <Card className={cn("py-4", className)}>
      <CardContent role="alert" className="flex items-center gap-4">
        <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
          <Icon className="size-4" />
        </div>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="text-sm font-medium">{title ?? t(`error.${kind}.title`)}</p>
          <p className="text-muted-foreground text-sm">
            {t(`error.${kind}.description`)}
            <span className="text-muted-foreground/80 ms-2 font-mono text-xs">
              {apiErrorDetail(error)}
            </span>
          </p>
        </div>
        {onRetry ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onRetry}
            disabled={retrying}
          >
            <RotateCw className={cn("size-4", retrying && "animate-spin")} />
            {t("error.retry")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
