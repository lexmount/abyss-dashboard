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
import { asFilterOptions, MultiSelectFilter } from "@/components/multi-select-filter";
import { TimeRangeField } from "@/components/time-range-field";
import { useI18n } from "@/hooks/use-i18n";
import { agentFilterOptions } from "@/lib/agents";
import { resolveTimeRange, type TimeRange } from "@/lib/time-range";
import {
  agentChoices,
  modelChoices,
  providerChoices,
  rowsOfAgents,
} from "@/lib/usage-choices";

/** Each list matches any of its values; an empty list matches everything. */
export interface SessionSearchFilters {
  q: string;
  time: TimeRange;
  agentNames: string[];
  providers: string[];
  models: string[];
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
  // Agent, provider, and model choices come from the sessions in the time
  // scope, so every Agent the backend reports is listed. Picking Agents narrows
  // the providers and models, and picking providers narrows the models to the
  // ones they served.
  const choiceScope = React.useMemo(() => resolveTimeRange(draft.time), [draft.time]);
  const choicesQuery = useQuery({
    queryKey: ["usage-models", "session-filters", choiceScope],
    queryFn: () =>
      fetchUsageSummary(choiceScope, { groupBy: ["provider", "model", "agent"] }),
    staleTime: 60_000,
  });
  const allRows = choicesQuery.data?.rows ?? [];
  const agents = agentFilterOptions(agentChoices(allRows, draft.agentNames));
  const rows = rowsOfAgents(allRows, draft.agentNames);
  const providers = asFilterOptions(providerChoices(rows, draft.providers));
  const models = asFilterOptions(
    modelChoices(
      draft.providers.length > 0
        ? rows.filter(
            (row) =>
              row.llm_provider !== undefined &&
              draft.providers.includes(row.llm_provider),
          )
        : rows,
      draft.models,
    ),
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
              <MultiSelectFilter
                label={t("common.agent")}
                options={agents}
                value={draft.agentNames}
                onChange={(agentNames) => update("agentNames", agentNames)}
              />
            </Field>
            <Field label={t("common.provider")}>
              <MultiSelectFilter
                label={t("common.provider")}
                options={providers}
                value={draft.providers}
                onChange={(providers) => update("providers", providers)}
              />
            </Field>
            <Field label={t("common.model")}>
              <MultiSelectFilter
                label={t("common.model")}
                options={models}
                value={draft.models}
                mono
                onChange={(models) => update("models", models)}
              />
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
