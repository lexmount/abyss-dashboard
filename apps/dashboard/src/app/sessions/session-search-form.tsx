import { RefreshCw, Search } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@lexmount/abyss-ui";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@lexmount/abyss-ui";
import { Input } from "@lexmount/abyss-ui";
import { Label } from "@lexmount/abyss-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lexmount/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";
import { agentFilterOptions } from "@/lib/agents";

export interface SessionSearchFilters {
  q: string;
  from: string;
  to: string;
  agentName: string;
  provider: string;
  model: string;
  eventType: "all" | "request" | "response";
}

interface SessionSearchFormProps {
  draft: SessionSearchFilters;
  searching: boolean;
  onDraftChange: (draft: SessionSearchFilters) => void;
  onSubmit: () => void;
  onReset: () => void;
}

const providerOptions = ["openai", "anthropic"] as const;

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
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (draft.q.trim()) {
      onSubmit();
    }
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader className="grid-rows-1 items-center">
          <CardTitle className="text-base leading-6">
            {t("sessions.search.title")}
          </CardTitle>
          <CardAction className="row-span-1 flex self-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onReset}>
              <RefreshCw className="size-4" />
              {t("common.reset")}
            </Button>
            <Button type="submit" size="sm" disabled={!draft.q.trim() || searching}>
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
          >
            <Field label={t("common.from")}>
              <Input
                type="datetime-local"
                value={draft.from}
                onChange={(event) => update("from", event.target.value)}
              />
            </Field>
            <Field label={t("common.to")}>
              <Input
                type="datetime-local"
                value={draft.to}
                onChange={(event) => update("to", event.target.value)}
              />
            </Field>
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
                  update("provider", value === "all" ? "" : value)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("common.model")}>
              <Input
                value={draft.model}
                maxLength={256}
                onChange={(event) => update("model", event.target.value)}
              />
            </Field>
            <Field label={t("common.event")}>
              <Select
                value={draft.eventType}
                onValueChange={(value: SessionSearchFilters["eventType"]) =>
                  update("eventType", value)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="request">{t("common.request")}</SelectItem>
                  <SelectItem value="response">{t("common.response")}</SelectItem>
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
    <div className="grid gap-2">
      <Label className="leading-5">{label}</Label>
      {children}
    </div>
  );
}
