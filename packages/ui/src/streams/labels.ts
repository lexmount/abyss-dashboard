/**
 * Words of the session stream view, from the host's translations. Counts the
 * view formats with `formatNumber` arrive as strings; the others arrive as
 * the view has them.
 */
export interface SessionStreamsLabels {
  /** Above the timeline; `turns` is how many numbered turns the session has. */
  summary: (turns: number) => string;
  /** Accessible name of the timeline. */
  timeline: string;
  /** A turn by its number, such as "Turn 3". */
  turnNumber: (number: string) => string;
  /** Names the segments before the session's first turn. */
  noTurn: string;
  /** Exchanges in a turn, an executor, or a segment, outside a search. */
  segmentExchanges: (count: string) => string;
  /** Search occurrences in a turn, an executor, or a segment. */
  segmentMatches: (count: string) => string;
  /** A turn or a side request without user words. */
  noUserInput: string;
  /** Above a turn that starts without a base: a new context. */
  newContext: string;
  /** The main line among a turn's executors. */
  mainLine: string;
  /** Names a subagent, before its short id. */
  subagent: string;
  /** An executor's side requests, how many. */
  sideRequests: (count: string) => string;
  /** While the chosen segment's exchanges load. */
  loading: string;

  request: string;
  response: string;
  requestMissing: string;
  responseMissing: string;
  noEntries: string;
  unknownModel: string;
  /** Unit after a card's token total. */
  tokens: string;
  tokensUnavailable: string;
  inputTokens: string;
  outputTokens: string;
  cacheReadTokens: string;
  cacheWriteTokens: string;
  reasoningTokens: string;
  /** Notes a conversation the collector could not decode completely. */
  incomplete: (completeness: string) => string;
  /** Where a request's new part begins. */
  newPart: string;
  /** The control that scrolls the page back to its top. */
  backToTop: string;
  /** While an event's whole conversation loads. */
  loadingConversation: string;
  /**
   * Entries a preview leaves out. With `loadConversation` they are a control
   * that loads them, so the words may say so; without it they are a note.
   */
  omitted: (count: string) => string;
  /** The same, holding search occurrences. */
  omittedMatches: (count: string, matches: string) => string;
  /** Why an event's whole conversation could not be loaded. */
  loadError: (error: unknown) => string;
  /** Expands or collapses an entry. */
  showMore: string;
  showLess: string;
  /** Length of an entry's text. */
  characters: (count: string) => string;
  /** Loads the rest of a text cut short; `count` is its whole length. */
  showRest: (count: string) => string;
  noText: string;

  /** Entry roles; a role not listed here shows as sent. */
  roleSystem: string;
  roleDeveloper: string;
  roleUser: string;
  roleAssistant: string;
  roleReasoning: string;
  roleToolCall: string;
  roleToolResult: string;
  roleUnknown: string;
}

/** Words of the session search field. */
export interface StreamSearchBoxLabels {
  /** Placeholder and accessible name of the field. */
  search: string;
  /** Position of the match being viewed, such as "3 / 17". */
  position: (current: string, total: string) => string;
  noMatches: string;
  previous: string;
  next: string;
  clear: string;
}

/** A turn's name: its number, or the stand-in for none. */
export function turnName(
  labels: Pick<SessionStreamsLabels, "turnNumber" | "noTurn">,
  formatNumber: (value: number) => string,
  turn: number | null,
): string {
  return turn === null ? labels.noTurn : labels.turnNumber(formatNumber(turn));
}
