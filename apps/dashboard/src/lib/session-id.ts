/** First segment of a session ID; callers keep the full ID available on hover. */
export function shortSessionId(sessionId: string): string {
  const [first] = sessionId.split("-");
  return first && first.length >= 6 ? first : sessionId.slice(0, 8);
}
