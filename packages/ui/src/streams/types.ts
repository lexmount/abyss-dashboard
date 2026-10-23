/**
 * The shapes of a session's streams that the stream view shows, as the
 * Abyss backend gives them. The host fetches them and passes them in; fields
 * the view does not read may be present and are ignored.
 */

/** A segment of a session, without its exchanges or any content. */
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
  /** The turn of the segment's first exchange; segments of one turn share it. */
  turn_id: string | null;
  /** Number of that turn in the session, from one. */
  turn: number | null;
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

export interface TokenCounts {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  reasoning: number;
  total: number;
}

/** The chosen part of one event's conversation. */
export interface ConversationPreview {
  event_pk: string;
  completeness: string | null;
  entries_total: number;
  chunks: { from: number; entries: ConversationPreviewEntry[] }[];
  omitted_entries: number;
  omitted_bytes: number;
}

/** One entry as the collector reported it. */
export interface ConversationPreviewEntry {
  role: string;
  text?: string;
  call_id?: string;
  name?: string;
  item_id?: string;
  /** Full length in UTF-16 code units of a text cut to the preview. */
  text_length?: number;
}

/** One exchange of a segment: a request, its response, and its base. */
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
  /** The turn the exchange belongs to, or null for none. */
  turn_id: string | null;
  /** Number of that turn in the session, from one. */
  turn: number | null;
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

/** The turns of a session, the timeline's rows. */
export interface SessionTurnsResponse {
  session_pk: string;
  turns: SessionTurn[];
}

/**
 * One user input and all the work it set going: its main line, the
 * subagents it spawned, and their side requests. The segments before the
 * session's first turn come as one turn without a number.
 */
export interface SessionTurn {
  /** Number of the turn in the session, from one; null for no turn. */
  turn: number | null;
  turn_id: string | null;
  start: string;
  end: string;
  exchange_count: number;
  /** The user input of the turn, from the earliest labeled main segment. */
  label: EntryLabel | null;
  /** Whether the turn's main line starts without a base: a new context. */
  new_context: boolean;
  /** The main line first, then each subagent as it appears. */
  executors: TurnExecutor[];
}

/** The main line or one subagent within a turn. */
export interface TurnExecutor {
  /** The subagent id, or null for the main line. */
  subagent_id: string | null;
  /** Heads of the segments on the executor's main line, in order. */
  main: string[];
  /** Heads of its other segments: side requests. */
  side: string[];
  exchange_count: number;
  start: string;
}
