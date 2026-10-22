import type {
  SessionTrajectoryEvent,
  SessionTrajectoryItem,
} from "@lexmount.com/abyss-ui";
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

/** A page of events as a list shows them, without their content. */
export interface EventListResponse {
  events: UsageEventListItem[];
  next_page_token: string | null;
}

/**
 * An event without its text, metadata, or attachments. Those hold whole
 * request bodies, often hundreds of kilobytes per event, and a list shows none
 * of them.
 */
export type UsageEventListItem = Omit<UsageEvent, "metadata" | "attachments">;

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
  /** Matching events in the session, of which `matches` shows some. */
  match_count: number;
  /** Matching events with at least one hit in what they added. */
  new_match_count: number;
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
  /**
   * The event has a hit in what it added: anywhere in a response, or from a
   * request's `new_from` on. Otherwise its hits are all in the context it
   * carried over.
   */
  new: boolean;
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
 * Token usage of one local day. The backend buckets days in UTC, so each local
 * day is asked for on its own and its rows (one per event type) are summed.
 */
export async function fetchDayTokenUsage(
  query: UsageQuery,
  { day, from, to }: UsageDayWindow,
): Promise<DailyTokenUsageRow> {
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
}

/**
 * One page of events newest first, as a list shows them; `offset` skips
 * earlier pages. Their content is left out, so the live dashboard's refreshes
 * move kilobytes rather than every request body on the page.
 */
export function fetchRawEvents(
  query: UsageQuery,
  page: { limit: number; offset: number } = { limit: rawEventsFetchLimit, offset: 0 },
): Promise<EventListResponse> {
  const params = usageParams(query);
  params.set("fields", "list");
  params.set("limit", page.limit.toString());
  if (page.offset > 0) {
    params.set("offset", page.offset.toString());
  }
  return fetchJson<EventListResponse>(`/api/v1/agent-usage/events?${params}`);
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
  events: SessionTrajectoryEvent[];
}

export function fetchSessionTrajectory(
  sessionPk: string,
): Promise<SessionTrajectoryResponse> {
  return fetchJson<SessionTrajectoryResponse>(
    `/api/v1/agent-usage/sessions/${encodeURIComponent(sessionPk)}/trajectory`,
  );
}

/** Segments of one session, without their exchanges or any content. */
export interface SessionStreamsResponse {
  session_pk: string;
  segments: StreamSegment[];
}

export interface StreamSegment {
  /** Id of the segment's first exchange, which identifies the segment. */
  head: string;
  kind: "root" | "turn" | "branch";
  /** Head of the segment holding the first exchange's base. */
  parent: string | null;
  /** Id of the first exchange's base. */
  forked_from: string | null;
  start: string;
  end: string;
  exchange_count: number;
  /** The new user words of the segment's first request. */
  label: EntryLabel | null;
}

/** Where a request's new user words are, and how they begin. */
export interface EntryLabel {
  event_pk: string;
  entry_index: number;
  /** At most the first 50 UTF-16 code units of the entry's text. */
  text: string;
  /** Length of the entry's whole text in UTF-16 code units. */
  length: number;
}

export function fetchSessionStreams(
  sessionPk: string,
): Promise<SessionStreamsResponse> {
  return fetchJson<SessionStreamsResponse>(
    `/api/v1/agent-usage/sessions/${encodeURIComponent(sessionPk)}/streams`,
  );
}

/** Agents, time span, counts, and token totals of one session. */
export interface SessionHeaderResponse {
  session_pk: string;
  session_id: string;
  /** The new user words of the session's first request. */
  title: EntryLabel | null;
  agents: { name: string; version: string | null }[];
  start: string;
  end: string;
  event_count: number;
  exchange_count: number;
  turn_count: number;
  segment_count: number;
  tokens: TokenCounts;
  providers: string[];
  models: string[];
}

export interface TokenCounts {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  reasoning: number;
  total: number;
}

export function fetchSessionHeader(sessionPk: string): Promise<SessionHeaderResponse> {
  return fetchJson<SessionHeaderResponse>(
    `/api/v1/agent-usage/sessions/${encodeURIComponent(sessionPk)}/header`,
  );
}

/** Which entries of a conversation to give, and how much of each text. */
export interface PreviewWindow {
  /** Runs such as `0-2,-5`; all entries without it. */
  entries?: string;
  /** Most UTF-16 code units of each text; whole texts without it. */
  textPreview?: number;
}

/** The chosen part of one event's conversation. */
export interface ConversationPreview {
  event_pk: string;
  completeness: string | null;
  entries_total: number;
  chunks: { from: number; entries: ConversationEntry[] }[];
  omitted_entries: number;
  omitted_bytes: number;
  attachments: UsageEventAttachment[];
}

/** One entry as the collector reported it. */
export interface ConversationEntry {
  role: string;
  text?: string;
  call_id?: string;
  name?: string;
  item_id?: string;
  /** Full length in UTF-16 code units of a text cut to the preview. */
  text_length?: number;
}

/** One segment's exchanges from the asked one to its end, all at once. */
export interface SegmentResponse {
  session_pk: string;
  segment: string;
  exchanges: SegmentExchange[];
}

export interface SegmentExchange {
  id: string;
  request_pk: string | null;
  response_pk: string | null;
  base: string | null;
  base_segment: string | null;
  rule: "pointer" | "last_output" | "results_only" | null;
  no_base_reason: string | null;
  new_from: number | null;
  starts_turn: boolean;
  requested_at: string | null;
  responded_at: string | null;
  model: string | null;
  request_tokens: TokenCounts | null;
  response_tokens: TokenCounts | null;
  request: ConversationPreview | null;
  response: ConversationPreview | null;
}

function windowParams(window: PreviewWindow, params = new URLSearchParams()) {
  if (window.entries !== undefined) params.set("entries", window.entries);
  if (window.textPreview !== undefined)
    params.set("text_preview", window.textPreview.toString());
  return params;
}

export function fetchSessionSegment(
  sessionPk: string,
  head: string,
  window: PreviewWindow,
): Promise<SegmentResponse> {
  return fetchJson<SegmentResponse>(
    `/api/v1/agent-usage/sessions/${encodeURIComponent(sessionPk)}/segments/${encodeURIComponent(head)}?${windowParams(window)}`,
  );
}

export function fetchEventConversation(
  eventPk: string,
  window: PreviewWindow = {},
): Promise<ConversationPreview> {
  return fetchJson<ConversationPreview>(
    `/api/v1/agent-usage/events/${encodeURIComponent(eventPk)}/conversation?${windowParams(window)}`,
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

/** A span of a text, start inclusive and end exclusive, in UTF-16 code units. */
export type TextRange = [start: number, end: number];

/** Where a search within one session found its text. */
export interface SessionTextSearchResponse {
  query: string;
  /** Each distinct text with the query in it, and where in it. */
  texts: { id: number; ranges: TextRange[] }[];
  /**
   * Each entry field holding one of those texts, by `observed_at`, then
   * event, entry, and the name before the text.
   */
  hits: SessionTextSearchHit[];
  /** The search found more hits than it gives. */
  truncated: boolean;
}

export interface SessionTextSearchHit {
  event_pk: string;
  /** Position of the entry in its event's conversation. */
  entry_index: number;
  /** The entry's tool name or its text. */
  field: "name" | "text";
  /** The hit is in what its event added rather than the context it carried. */
  new: boolean;
  text_id: number;
  /** Head of the segment the event's exchange is in, or null for none. */
  segment: string | null;
}

/** Searches the text of one session's entries. */
export function searchWithinSession(
  sessionPk: string,
  query: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<SessionTextSearchResponse> {
  const params = new URLSearchParams({ q: query });
  return fetchJson<SessionTextSearchResponse>(
    `/api/v1/agent-usage/sessions/${encodeURIComponent(sessionPk)}/search?${params}`,
    { signal },
  );
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
