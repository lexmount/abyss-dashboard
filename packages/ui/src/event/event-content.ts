/** Readers for collector metadata shown with an event. */

/**
 * One HTTP header as the collector recorded it: `value` when the bytes were
 * UTF-8, otherwise `valueBase64`.
 */
export type RecordedHeader =
  { name: string; value: string } | { name: string; valueBase64: string };

/**
 * The headers in `metadata.headers` (a request's headers on a request event, a
 * response's on a response event), in recorded order with duplicates kept.
 * Names and values are passed through untouched.
 */
export function recordedHeaders(metadata: unknown): RecordedHeader[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.headers)) {
    return [];
  }

  return metadata.headers.flatMap((entry): RecordedHeader[] => {
    if (!isRecord(entry) || typeof entry.name !== "string") {
      return [];
    }
    if (typeof entry.value === "string") {
      return [{ name: entry.name, value: entry.value }];
    }
    if (typeof entry.value_base64 === "string") {
      return [{ name: entry.name, valueBase64: entry.value_base64 }];
    }
    return [];
  });
}

/** What the Agent made the call for, in `metadata.purpose`; null when absent. */
export function recordedPurpose(metadata: unknown): string | null {
  return isRecord(metadata) && typeof metadata.purpose === "string"
    ? metadata.purpose
    : null;
}

/**
 * The content categories the collector's policy left out, in
 * `metadata.omitted`; empty when it left out none.
 */
export function recordedOmitted(metadata: unknown): string[] {
  return isRecord(metadata) && Array.isArray(metadata.omitted)
    ? metadata.omitted.filter(
        (category): category is string => typeof category === "string",
      )
    : [];
}

/**
 * The request path and query in `metadata.path`, as the request named them;
 * both events of an exchange carry it. Null when absent.
 */
export function recordedPath(metadata: unknown): string | null {
  return isRecord(metadata) && typeof metadata.path === "string"
    ? metadata.path
    : null;
}

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

/** Tool segments of the retired `metadata.content_segments`, read by the old timeline. */
export interface ToolContentSegment {
  type: "tool_call" | "tool_result";
  itemId: string | null;
  callId: string | null;
  name: string | null;
  content: string | null;
}

export function toolContentSegments(metadata: unknown): ToolContentSegment[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.content_segments)) {
    return [];
  }

  return metadata.content_segments.flatMap((value): ToolContentSegment[] => {
    if (
      !isRecord(value) ||
      (value.type !== "tool_call" && value.type !== "tool_result")
    ) {
      return [];
    }
    const isToolCall = value.type === "tool_call";
    return [
      {
        type: value.type,
        itemId: stringValue(value.item_id),
        callId: stringValue(value.call_id),
        name: isToolCall ? stringValue(value.name) : null,
        content: stringValue(isToolCall ? value.input : value.output),
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
