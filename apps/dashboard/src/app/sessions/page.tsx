import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { searchSessions, type SessionSearchQuery } from "@/api/usage";
import {
  SessionSearchForm,
  type SessionSearchFilters,
} from "@/app/sessions/session-search-form";
import { SessionSearchResults } from "@/app/sessions/session-search-results";
import { BaseLayout } from "@/components/layouts/base-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@lexmount.com/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";

const defaultFilters: SessionSearchFilters = {
  q: "",
  from: "",
  to: "",
  agentName: "",
  provider: "",
  model: "",
  eventType: "all",
};

export default function SessionsPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedFilters = React.useMemo(
    () => filtersFromParams(searchParams),
    [searchParams],
  );
  const [draft, setDraft] = React.useState(appliedFilters);
  const page = positiveInteger(searchParams.get("page")) ?? 1;
  const hasQuery = appliedFilters.q.trim().length > 0;
  const searchQuery = useQuery({
    queryKey: ["session-search", appliedFilters, page],
    queryFn: () => searchSessions(apiQuery(appliedFilters, page)),
    enabled: hasQuery,
    placeholderData: keepPreviousData,
  });

  React.useEffect(() => {
    setDraft(appliedFilters);
  }, [appliedFilters]);

  const applySearch = (): void => {
    setSearchParams(paramsFromFilters(draft, 1));
  };
  const resetSearch = (): void => {
    setDraft(defaultFilters);
    setSearchParams(new URLSearchParams());
  };
  const changePage = (nextPage: number): void => {
    setSearchParams(paramsFromFilters(appliedFilters, nextPage));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <BaseLayout title={t("sessions.title")} description={t("sessions.description")}>
      <div className="@container/main space-y-6 px-4 lg:px-6">
        <SessionSearchForm
          draft={draft}
          searching={searchQuery.isFetching}
          onDraftChange={setDraft}
          onSubmit={applySearch}
          onReset={resetSearch}
        />

        {!hasQuery ? <SearchIntroduction /> : null}
        {hasQuery && searchQuery.isLoading ? <SearchLoading /> : null}
        {searchQuery.isError ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>{t("sessions.search.errorTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              {searchQuery.error.message}
            </CardContent>
          </Card>
        ) : null}
        {searchQuery.data ? (
          <SessionSearchResults response={searchQuery.data} onPageChange={changePage} />
        ) : null}
      </div>
    </BaseLayout>
  );
}

function SearchIntroduction() {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-12 text-center">
        <Search className="size-8" />
        <div className="text-foreground font-medium">
          {t("sessions.search.introductionTitle")}
        </div>
        <div className="max-w-2xl text-sm">
          {t("sessions.search.introductionDescription")}
        </div>
      </CardContent>
    </Card>
  );
}

function SearchLoading() {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="text-muted-foreground py-12 text-center text-sm">
        {t("sessions.search.loading")}
      </CardContent>
    </Card>
  );
}

export function filtersFromParams(params: URLSearchParams): SessionSearchFilters {
  const eventType = params.get("event_type");
  return {
    q: params.get("q") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    agentName: params.get("agent_name") ?? "",
    provider: params.get("llm_provider") ?? "",
    model: params.get("llm_model") ?? "",
    eventType: eventType === "request" || eventType === "response" ? eventType : "all",
  };
}

export function paramsFromFilters(
  filters: SessionSearchFilters,
  page: number,
): URLSearchParams {
  const params = new URLSearchParams();
  appendParam(params, "q", filters.q);
  appendParam(params, "from", filters.from);
  appendParam(params, "to", filters.to);
  appendParam(params, "agent_name", filters.agentName);
  appendParam(params, "llm_provider", filters.provider);
  appendParam(params, "llm_model", filters.model);
  if (filters.eventType !== "all") {
    params.set("event_type", filters.eventType);
  }
  if (page > 1) {
    params.set("page", page.toString());
  }
  return params;
}

function apiQuery(filters: SessionSearchFilters, page: number): SessionSearchQuery {
  return {
    q: filters.q,
    from: isoDateTime(filters.from),
    to: isoDateTime(filters.to),
    agentName: filters.agentName || undefined,
    provider: filters.provider || undefined,
    model: filters.model || undefined,
    eventType: filters.eventType === "all" ? undefined : filters.eventType,
    page,
    pageSize: 20,
  };
}

function isoDateTime(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function appendParam(params: URLSearchParams, key: string, value: string): void {
  if (value.trim()) {
    params.set(key, value.trim());
  }
}

function positiveInteger(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
