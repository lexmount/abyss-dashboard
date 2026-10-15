import {
  keepPreviousData,
  type Query,
  useIsFetching,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  filterValueList,
  listSessions,
  searchSessions,
  type SessionSearchQuery,
} from "@/api/usage";
import {
  SessionSearchForm,
  type SessionSearchFilters,
} from "@/app/sessions/session-search-form";
import { SessionList } from "@/app/sessions/session-list";
import { SessionSearchResults } from "@/app/sessions/session-search-results";
import { BaseLayout } from "@/components/layouts/base-layout";
import { QueryErrorCard } from "@/components/query-error";
import { RefreshControl } from "@/components/refresh-control";
import { Card, CardContent } from "@lexmount.com/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";
import {
  createTimeRange,
  isTimeRangePreset,
  resolveTimeRange,
  type TimeRange,
} from "@/lib/time-range";

const sessionListPageSize = 20;

const defaultFilters: SessionSearchFilters = {
  q: "",
  time: createTimeRange("any"),
  agentNames: [],
  providers: [],
  models: [],
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
  // Without a keyword the page lists every session in the filter scope.
  const listQuery = useQuery({
    queryKey: [
      "session-list",
      appliedFilters.time,
      appliedFilters.agentNames,
      appliedFilters.providers,
      appliedFilters.models,
      page,
    ],
    queryFn: () =>
      listSessions({
        ...resolveTimeRange(appliedFilters.time),
        agentName: appliedFilters.agentNames,
        provider: appliedFilters.providers,
        model: appliedFilters.models,
        page,
        pageSize: sessionListPageSize,
      }),
    enabled: !hasQuery,
    placeholderData: keepPreviousData,
  });

  React.useEffect(() => {
    setDraft(appliedFilters);
  }, [appliedFilters]);

  // Refetching re-resolves relative time ranges, so the list reaches now.
  const queryClient = useQueryClient();
  const refreshing = useIsFetching({ predicate: isSessionsPageQuery }) > 0;
  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      updatedAt={hasQuery ? searchQuery.dataUpdatedAt : listQuery.dataUpdatedAt}
      onRefresh={() => {
        void queryClient.invalidateQueries({ predicate: isSessionsPageQuery });
      }}
    />
  );

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
          searching={hasQuery ? searchQuery.isFetching : listQuery.isFetching}
          onDraftChange={setDraft}
          onSubmit={applySearch}
          onReset={resetSearch}
        />

        {!hasQuery ? (
          listQuery.isError ? (
            <QueryErrorCard
              error={listQuery.error}
              retrying={listQuery.isFetching}
              onRetry={() => void listQuery.refetch()}
            />
          ) : (
            <SessionList
              response={listQuery.data}
              loading={listQuery.isFetching}
              onPageChange={changePage}
              action={refresh}
            />
          )
        ) : null}
        {hasQuery && searchQuery.isLoading ? <SearchLoading /> : null}
        {searchQuery.isError ? (
          <QueryErrorCard
            error={searchQuery.error}
            retrying={searchQuery.isFetching}
            onRetry={() => void searchQuery.refetch()}
          />
        ) : null}
        {searchQuery.data ? (
          <SessionSearchResults
            response={searchQuery.data}
            onPageChange={changePage}
            action={refresh}
          />
        ) : null}
      </div>
    </BaseLayout>
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
  return {
    q: params.get("q") ?? "",
    time: timeRangeFromParams(params),
    agentNames: params.getAll("agent_name"),
    providers: params.getAll("llm_provider"),
    models: params.getAll("llm_model"),
  };
}

export function paramsFromFilters(
  filters: SessionSearchFilters,
  page: number,
): URLSearchParams {
  const params = new URLSearchParams();
  appendParam(params, "q", filters.q);
  if (filters.time.preset !== "any") {
    params.set("range", filters.time.preset);
  }
  if (filters.time.preset === "custom") {
    appendParam(params, "from", filters.time.from);
    appendParam(params, "to", filters.time.to);
  }
  // Each chosen value repeats its key, matching the backend API.
  for (const agentName of filterValueList(filters.agentNames)) {
    params.append("agent_name", agentName);
  }
  for (const provider of filterValueList(filters.providers)) {
    params.append("llm_provider", provider);
  }
  for (const model of filterValueList(filters.models)) {
    params.append("llm_model", model);
  }
  if (page > 1) {
    params.set("page", page.toString());
  }
  return params;
}

function apiQuery(filters: SessionSearchFilters, page: number): SessionSearchQuery {
  return {
    q: filters.q,
    ...resolveTimeRange(filters.time),
    agentName: filters.agentNames,
    provider: filters.providers,
    model: filters.models,
    page,
    pageSize: 20,
  };
}

function timeRangeFromParams(params: URLSearchParams): TimeRange {
  const range = params.get("range");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  // Links created before presets existed carry only from/to date-times.
  const preset = isTimeRangePreset(range) ? range : from || to ? "custom" : "any";
  const time = createTimeRange(preset);
  return preset === "custom"
    ? { preset, from: from || time.from, to: to || time.to }
    : time;
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

const sessionsPageQueryRoots = new Set([
  "session-list",
  "session-search",
  "usage-models",
]);

function isSessionsPageQuery(query: Query): boolean {
  return sessionsPageQueryRoots.has(String(query.queryKey[0]));
}
