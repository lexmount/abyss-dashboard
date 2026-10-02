import type { SessionTrajectoryItem } from "@lexmount.com/abyss-ui";
import { fetchJson } from "@/api/http";

export interface SummaryResponse {
  from: string | null;
  to: string | null;
  group_by: string[];
  rows: SummaryRow[];
  next_page_token: string | null;
}

export interface SummaryRow {
  day?: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  host_name?: string;
  platform?: string;
  os_version?: string;
  agent_name?: string;
  llm_provider?: string;
  llm_model?: string;
  event_type?: string;
  sessions: number;
  turns: number;
  requests: number;
  responses: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

export interface DailyTokenUsageResponse {
  from: string | null;
  to: string | null;
  group_by: string[];
  rows: DailyTokenUsageRow[];
  next_page_token: string | null;
}

export interface DailyTokenUsageRow {
  day?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
}

export interface RawEventsResponse {
  events: UsageEvent[];
  next_page_token: string | null;
}

export interface UsageEvent {
  id: string;
  event_id: string;
  user_id: string;
  device_context_id: string;
  host_name?: string | null;
  platform?: string | null;
  session_pk: string;
  turn_pk: string;
  agent_name: string;
  agent_version: string | null;
  session_id: string;
  turn_index: number;
  llm_provider: string;
  llm_model: string;
  event_type: string;
  text: string | null;
  text_sha256: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  observed_at: string;
  metadata: unknown;
  attachments: UsageEventAttachment[];
}

export interface UsageEventAttachment {
  id: string;
  position: number;
  media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  byte_size: number;
  sha256: string;
  content_available: boolean;
}

export interface SessionTimelineResponse {
  session: SessionInfo;
  turns: TurnTimeline[];
}

export interface SessionInfo {
  session_pk: string;
  user_id: string;
  device_context_id: string;
  agent_name: string;
  agent_version: string | null;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  metadata: unknown;
  /** Name the Agent generated for the session, when one was captured. */
  title: string | null;
  /** Why the session exists when it is not ordinary work, e.g. "title_generation". */
  purpose: string | null;
  /** For a naming session, the task session its title was matched to. */
  parent_session_pk: string | null;
}

export interface TurnTimeline {
  turn_pk: string;
  turn_index: number;
  started_at: string;
  ended_at: string | null;
  events: UsageEvent[];
}

/** One filter value, or several where any of them matches. */
export type FilterValues = string | readonly string[];

export interface SessionSearchQuery {
  q: string;
  from?: string;
  to?: string;
  agentName?: FilterValues;
  provider?: FilterValues;
  model?: FilterValues;
  eventType?: "request" | "response";
  page?: number;
  pageSize?: number;
}

export interface SessionSearchResponse {
  query: string;
  total_sessions: number;
  page: number;
  page_size: number;
  has_more: boolean;
  items: SessionSearchResult[];
}

export interface SessionSearchResult {
  session_pk: string;
  session_id: string;
  agent_name: string;
  agent_version: string | null;
  host_name: string;
  platform: string;
  started_at: string;
  ended_at: string | null;
  providers: string[];
  models: string[];
  match_count: number;
  matches: SessionSearchMatch[];
}

export interface SessionSearchMatch {
  event_pk: string;
  turn_pk: string;
  turn_index: number;
  event_type: string;
  llm_provider: string;
  llm_model: string;
  observed_at: string;
  fragments: SearchFragment[];
}

export interface SearchFragment {
  segments: SearchFragmentSegment[];
}

export interface SearchFragmentSegment {
  text: string;
  highlighted: boolean;
}

export interface UsageQuery {
  from?: string;
  to?: string;
  agentName?: FilterValues;
  sessionId?: FilterValues;
  provider?: FilterValues;
  model?: FilterValues;
  eventType?: string;
}

export interface SummaryRequestOptions {
  groupBy?: string[];
  limit?: number;
}

const defaultSummaryGroupBy = ["agent", "provider", "model"];
const summaryFetchLimit = 500;
const rawEventsFetchLimit = 100;

export function fetchUsageSummary(
  query: UsageQuery,
  options: SummaryRequestOptions = {},
): Promise<SummaryResponse> {
  const params = usageParams(query);
  params.set("group_by", (options.groupBy ?? defaultSummaryGroupBy).join(","));
  params.set("limit", (options.limit ?? summaryFetchLimit).toString());
  return fetchJson<SummaryResponse>(`/api/v1/agent-usage/summary?${params}`);
}

/** One day of the chart, bounded in the viewer's own time zone. */
export interface UsageDayWindow {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  from: string;
  to: string;
}

/**
 * Token usage per local day. The backend buckets days in UTC, so each local
 * day is asked for on its own and its rows (one per event type) are summed.
 */
export async function fetchDailyTokenUsage(
  query: UsageQuery,
  days: readonly UsageDayWindow[],
): Promise<DailyTokenUsageResponse> {
  const rows = await Promise.all(
    days.map(async ({ day, from, to }) => {
      const params = usageParams({ ...query, from, to });
      params.set("group_by", "event_type");
      params.set("fields", "token_usage");
      const response = await fetchJson<DailyTokenUsageResponse>(
        `/api/v1/agent-usage/summary?${params}`,
      );
      return response.rows.reduce<DailyTokenUsageRow>(
        (total, row) => ({
          day,
          input_tokens: total.input_tokens + row.input_tokens,
          output_tokens: total.output_tokens + row.output_tokens,
          cache_read_tokens: total.cache_read_tokens + row.cache_read_tokens,
          cache_write_tokens: total.cache_write_tokens + row.cache_write_tokens,
          total_tokens: total.total_tokens + row.total_tokens,
        }),
        {
          day,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          total_tokens: 0,
        },
      );
    }),
  );
  return {
    from: days[0]?.from ?? null,
    to: days.at(-1)?.to ?? null,
    group_by: ["day"],
    rows,
    next_page_token: null,
  };
}

/** One page of raw events, newest first; `offset` skips earlier pages. */
export function fetchRawEvents(
  query: UsageQuery,
  page: { limit: number; offset: number } = { limit: rawEventsFetchLimit, offset: 0 },
): Promise<RawEventsResponse> {
  const params = usageParams(query);
  params.set("limit", page.limit.toString());
  if (page.offset > 0) {
    params.set("offset", page.offset.toString());
  }
  return fetchJson<RawEventsResponse>(`/api/v1/agent-usage/events?${params}`);
}

export function fetchSessionTimeline(
  sessionPk: string,
): Promise<SessionTimelineResponse> {
  return fetchJson<SessionTimelineResponse>(
    `/api/v1/agent-usage/sessions/${encodeURIComponent(sessionPk)}`,
  );
}

export interface SessionTrajectoryResponse {
  session: SessionInfo;
  items: SessionTrajectoryItem[];
}

export function fetchSessionTrajectory(
  sessionPk: string,
): Promise<SessionTrajectoryResponse> {
  return fetchJson<SessionTrajectoryResponse>(
    `/api/v1/agent-usage/sessions/${encodeURIComponent(sessionPk)}/trajectory`,
  );
}

export function fetchUsageEvent(eventPk: string): Promise<UsageEvent> {
  return fetchJson<UsageEvent>(
    `/api/v1/agent-usage/events/${encodeURIComponent(eventPk)}`,
  );
}

export interface SessionListQuery {
  from?: string;
  to?: string;
  agentName?: FilterValues;
  provider?: FilterValues;
  model?: FilterValues;
  page?: number;
  pageSize?: number;
}

export interface SessionListResponse {
  total_sessions: number;
  page: number;
  page_size: number;
  has_more: boolean;
  items: SessionListItem[];
}

export interface SessionListItem {
  session_pk: string;
  session_id: string;
  agent_name: string;
  agent_version: string | null;
  host_name: string;
  platform: string;
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
  turns: number;
  events: number;
  total_tokens: number;
  /** Name the Agent generated for the session, when one was captured. */
  title: string | null;
  /** Why the session exists when it is not ordinary work, e.g. "title_generation". */
  purpose: string | null;
}

/** Lists observed sessions, most recently active first. */
export function listSessions(query: SessionListQuery): Promise<SessionListResponse> {
  const params = new URLSearchParams();
  append(params, "from", query.from);
  append(params, "to", query.to);
  appendAll(params, "agent_name", query.agentName);
  appendAll(params, "llm_provider", query.provider);
  appendAll(params, "llm_model", query.model);
  if (query.page !== undefined) {
    params.set("page", query.page.toString());
  }
  if (query.pageSize !== undefined) {
    params.set("page_size", query.pageSize.toString());
  }
  return fetchJson<SessionListResponse>(`/api/v1/agent-usage/sessions?${params}`);
}

export function searchSessions(
  query: SessionSearchQuery,
): Promise<SessionSearchResponse> {
  const params = new URLSearchParams();
  params.set("q", query.q.trim());
  append(params, "from", query.from);
  append(params, "to", query.to);
  appendAll(params, "agent_name", query.agentName);
  appendAll(params, "llm_provider", query.provider);
  appendAll(params, "llm_model", query.model);
  append(params, "event_type", query.eventType);
  if (query.page !== undefined) {
    params.set("page", query.page.toString());
  }
  if (query.pageSize !== undefined) {
    params.set("page_size", query.pageSize.toString());
  }
  return fetchJson<SessionSearchResponse>(`/api/v1/agent-usage/search?${params}`);
}

export function usageAttachmentUrl(attachmentId: string): string {
  return `/api/v1/agent-usage/attachments/${encodeURIComponent(attachmentId)}`;
}

function usageParams(query: UsageQuery): URLSearchParams {
  const params = new URLSearchParams();
  append(params, "from", query.from);
  append(params, "to", query.to);
  appendAll(params, "agent_name", query.agentName);
  appendAll(params, "session_id", query.sessionId);
  appendAll(params, "llm_provider", query.provider);
  appendAll(params, "llm_model", query.model);
  append(params, "event_type", query.eventType);
  return params;
}

function append(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined && value.trim().length > 0) {
    params.set(key, value.trim());
  }
}

/** Repeats the key once per value; the backend matches any of them. */
function appendAll(
  params: URLSearchParams,
  key: string,
  values: FilterValues | undefined,
): void {
  for (const value of filterValueList(values)) {
    params.append(key, value);
  }
}

/** Trimmed, non-empty filter values; an empty list means no filter. */
export function filterValueList(values: FilterValues | undefined): string[] {
  const list = typeof values === "string" ? [values] : (values ?? []);
  return list.map((value) => value.trim()).filter((value) => value.length > 0);
}
