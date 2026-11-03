/** Readers for the recorded content shown with an event. */

/**
 * One protocol block of a request or response, in its recorded place. `text`
 * is a tool call's arguments or a tool result's output for those roles.
 */
export interface ConversationEntry {
  /** system, developer, user, assistant, reasoning, tool_call, tool_result, or unknown. */
  role: string;
  text: string;
  callId: string | null;
  name: string | null;
}

export interface Conversation {
  entries: ConversationEntry[];
  /** Whether the body was decoded completely, as the collector reported it. */
  completeness: string | null;
}

/**
 * An event's `conversation` when it holds `entries`, in recorded order; null
 * for events recorded without one.
 */
export function conversationOf(conversation: unknown): Conversation | null {
  if (!isRecord(conversation)) {
    return null;
  }
  const { entries, completeness } = conversation;
  if (!Array.isArray(entries)) {
    return null;
  }
  return {
    // An entry that is not an object stays, as an unknown one, so every
    // entry keeps the index the backend gives it.
    entries: entries.map((entry): ConversationEntry =>
      isRecord(entry)
        ? {
            role: typeof entry.role === "string" ? entry.role : "unknown",
            text: typeof entry.text === "string" ? entry.text : "",
            callId: typeof entry.call_id === "string" ? entry.call_id : null,
            name: typeof entry.name === "string" ? entry.name : null,
          }
        : { role: "unknown", text: "", callId: null, name: null },
    ),
    completeness: typeof completeness === "string" ? completeness : null,
  };
}

/**
 * How many entries from the start are system or developer entries: the
 * system prompt, which providers always place first.
 */
export function leadingInstructionCount(entries: ConversationEntry[]): number {
  const index = entries.findIndex(
    (entry) => entry.role !== "system" && entry.role !== "developer",
  );
  return index === -1 ? entries.length : index;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
