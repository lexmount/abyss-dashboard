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
}

export interface TurnTimeline {
  turn_pk: string;
  turn_index: number;
  started_at: string;
  ended_at: string | null;
  events: UsageEvent[];
}

export interface SessionSearchQuery {
  q: string;
  from?: string;
  to?: string;
  agentName?: string;
  provider?: string;
  model?: string;
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
  agentName?: string;
  sessionId?: string;
  provider?: string;
  model?: string;
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

export function fetchDailyTokenUsage(
  query: UsageQuery,
): Promise<DailyTokenUsageResponse> {
  const params = usageParams(query);
  params.set("group_by", "day");
  params.set("fields", "token_usage");
  return fetchJson<DailyTokenUsageResponse>(`/api/v1/agent-usage/summary?${params}`);
}

export function fetchRawEvents(query: UsageQuery): Promise<RawEventsResponse> {
  const params = usageParams(query);
  params.set("limit", rawEventsFetchLimit.toString());
  return fetchJson<RawEventsResponse>(`/api/v1/agent-usage/events?${params}`);
}

export function fetchSessionTimeline(
  sessionPk: string,
): Promise<SessionTimelineResponse> {
  return fetchJson<SessionTimelineResponse>(
    `/api/v1/agent-usage/sessions/${encodeURIComponent(sessionPk)}`,
  );
}

export function searchSessions(
  query: SessionSearchQuery,
): Promise<SessionSearchResponse> {
  const params = new URLSearchParams();
  params.set("q", query.q.trim());
  append(params, "from", query.from);
  append(params, "to", query.to);
  append(params, "agent_name", query.agentName);
  append(params, "llm_provider", query.provider);
  append(params, "llm_model", query.model);
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
  append(params, "agent_name", query.agentName);
  append(params, "session_id", query.sessionId);
  append(params, "llm_provider", query.provider);
  append(params, "llm_model", query.model);
  append(params, "event_type", query.eventType);
  return params;
}

function append(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined && value.trim().length > 0) {
    params.set(key, value.trim());
  }
}
