/**
 * Words of the session stream view, from the host's translations. Counts the
 * view formats with `formatNumber` arrive as strings; the others arrive as
 * the view has them.
 */
export interface SessionStreamsLabels {
  /** Above the timeline; `segments` is how many the session has. */
  summary: (segments: number) => string;
  /** Accessible name of the timeline. */
  timeline: string;
  /** A segment's name in the timeline, such as "Turn 3". */
  segmentNumber: (number: string) => string;
  /** Exchanges in a segment, outside a search. */
  segmentExchanges: (count: string) => string;
  /** Search occurrences in a segment. */
  segmentMatches: (count: string) => string;
  /** A segment that neither has new user words nor continues another. */
  noUserInput: string;
  /** A segment or exchange continuing the given segment, numbered from one. */
  continuesSegment: (number: number) => string;
  /** Names a subagent's segments, before its declared id. */
  subagent: string;
  /** Marks a subagent segment attached to the turn that spawned it. */
  derived: string;
  /** Marks an attachment made by time rather than by a declared turn. */
  byTime: string;
  /** Before the subagents a segment spawned, above its exchanges. */
  spawned: string;
  /** While the chosen segment's exchanges load. */
  loading: string;
  /** An exchange without a base, and why. */
  noBase: (reason: string) => string;
  /** The exchange an exchange continues, and by which rule. */
  after: (exchange: string, rule: string) => string;

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
  /** A tool call's input and a tool result's output. */
  input: string;
  output: string;
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
