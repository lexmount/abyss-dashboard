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
  agent_name: string;
  agent_version: string | null;
  session_id: string;
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
  location?: EventStreamLocation | null;
}

export interface UsageEventAttachment {
  id: string;
  position: number;
  media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  byte_size: number;
  sha256: string;
  content_available: boolean;
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
  /** The same request label shown by the session list and header. */
  title: EntryLabel | null;
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
  location?: EventStreamLocation | null;
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

/** The viewer's IANA time zone, whose calendar days usage charts follow. */
export const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Token usage of each calendar day in `timeZone` that has events. */
export function fetchDailyTokenUsage(
  query: UsageQuery,
  timeZone: string,
): Promise<DailyTokenUsageResponse> {
  const params = usageParams(query);
  params.set("group_by", "day");
  params.set("tz", timeZone);
  params.set("fields", "token_usage");
  return fetchJson<DailyTokenUsageResponse>(`/api/v1/agent-usage/summary?${params}`);
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
  params.set("locate", "true");
  params.set("limit", page.limit.toString());
  if (page.offset > 0) {
    params.set("offset", page.offset.toString());
  }
  return fetchJson<EventListResponse>(`/api/v1/agent-usage/events?${params}`);
}

/** An event's current place in the derived session structure. */
export interface EventStreamLocation {
  segment: string;
  /** Position in the session's segment list, starting at one. */
  segment_index: number;
  segment_kind: "root" | "turn" | "branch";
  exchange: string;
}

export interface EventLocationResponse extends EventStreamLocation {
  session_pk: string;
  event_pk: string;
}

export function fetchEventLocation(eventPk: string): Promise<EventLocationResponse> {
  return fetchJson<EventLocationResponse>(
    `/api/v1/agent-usage/events/${encodeURIComponent(eventPk)}/location`,
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
  /** The subagent id the first exchange declared, if any. */
  subagent_id: string | null;
  /**
   * Head of the segment a subagent's first segment is attached to, the turn
   * that spawned it. Attachment only places the segment for display: its
   * `parent`, `forked_from`, and segmentation stay as they are.
   */
  attached_to: string | null;
  /** By the declared turn id, or by time when no turn was declared. */
  attached_by: "declared" | "time" | null;
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
  /** Label from the first request's last nonempty user entry in its new part. */
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
  /** Ids the client declared in its request headers, as sent. */
  subagent_id: string | null;
  parent_subagent_id: string | null;
  root_turn_id: string | null;
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
  /** Label from the first request's last nonempty user entry in its new part. */
  title: EntryLabel | null;
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
