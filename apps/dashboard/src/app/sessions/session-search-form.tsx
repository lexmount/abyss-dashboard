import { RotateCcw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import type { FormEvent, ReactNode } from "react";
import { fetchUsageSummary } from "@/api/usage";
import { Button } from "@lexmount.com/abyss-ui";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lexmount.com/abyss-ui";
import { Input } from "@lexmount.com/abyss-ui";
import { Label } from "@lexmount.com/abyss-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lexmount.com/abyss-ui";
import { TimeRangeField } from "@/components/time-range-field";
import { useI18n } from "@/hooks/use-i18n";
import { agentFilterOptions } from "@/lib/agents";
import { resolveTimeRange, type TimeRange } from "@/lib/time-range";
import { modelChoices, providerChoices } from "@/lib/usage-choices";

export interface SessionSearchFilters {
  q: string;
  time: TimeRange;
  agentName: string;
  provider: string;
  model: string;
}

interface SessionSearchFormProps {
  draft: SessionSearchFilters;
  searching: boolean;
  onDraftChange: (draft: SessionSearchFilters) => void;
  onSubmit: () => void;
  onReset: () => void;
}

export function SessionSearchForm({
  draft,
  searching,
  onDraftChange,
  onSubmit,
  onReset,
}: SessionSearchFormProps) {
  const { t } = useI18n();
  const update = <Key extends keyof SessionSearchFilters>(
    key: Key,
    value: SessionSearchFilters[Key],
  ): void => onDraftChange({ ...draft, [key]: value });
  // Provider and model choices come from the sessions in the time and Agent
  // scope; picking a provider narrows the models to the ones it served.
  const choiceScope = React.useMemo(
    () => ({ ...resolveTimeRange(draft.time), agentName: draft.agentName }),
    [draft.time, draft.agentName],
  );
  const choicesQuery = useQuery({
    queryKey: ["usage-models", "session-filters", choiceScope],
    queryFn: () => fetchUsageSummary(choiceScope, { groupBy: ["provider", "model"] }),
    staleTime: 60_000,
  });
  const rows = choicesQuery.data?.rows ?? [];
  const providers = providerChoices(rows, draft.provider);
  const models = modelChoices(
    draft.provider ? rows.filter((row) => row.llm_provider === draft.provider) : rows,
    draft.model,
  );
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-6">
        <CardHeader>
          <CardTitle>{t("sessions.search.title")}</CardTitle>
          <CardDescription>{t("sessions.search.description")}</CardDescription>
          <CardAction className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="size-4" />
              {t("common.reset")}
            </Button>
            <Button type="submit" size="sm" disabled={searching}>
              <Search className="size-4" />
              {t("sessions.search.submit")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label={t("sessions.search.queryLabel")}>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                className="session-search-query-input"
                data-testid="session-search-query-input"
                value={draft.q}
                maxLength={256}
                autoComplete="off"
                placeholder={t("sessions.search.placeholder")}
                aria-label={t("sessions.search.queryLabel")}
                onChange={(event) => update("q", event.target.value)}
              />
            </div>
          </Field>

          <div
            className="session-search-filter-grid grid gap-4"
            data-testid="session-search-filter-grid"
            data-time-range={draft.time.preset}
          >
            <TimeRangeField
              value={draft.time}
              onChange={(time) => update("time", time)}
            />
            <Field label={t("common.agent")}>
              <Select
                value={draft.agentName || "all"}
                onValueChange={(value) =>
                  update("agentName", value === "all" ? "" : value)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {agentFilterOptions.map((agent) => (
                    <SelectItem key={agent.value} value={agent.value}>
                      {agent.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("common.provider")}>
              <Select
                value={draft.provider || "all"}
                onValueChange={(value) =>
                  onDraftChange({
                    ...draft,
                    provider: value === "all" ? "" : value,
                    model: "",
                  })
                }
              >
                <SelectTrigger className="w-full" aria-label={t("common.provider")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {providers.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("common.model")}>
              <Select
                value={draft.model || "all"}
                onValueChange={(value) => update("model", value === "all" ? "" : value)}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label={t("common.model")}
                  title={draft.model || undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {models.map((model) => (
                    <SelectItem key={model} value={model} className="font-mono text-xs">
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
