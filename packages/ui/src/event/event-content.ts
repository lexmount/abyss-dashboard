/** Readers for collector metadata shared by session timeline presentations. */

export interface ToolContentSegment {
  type: "tool_call" | "tool_result";
  itemId: string | null;
  callId: string | null;
  name: string | null;
  content: string | null;
}

export function isEstimatedTokenUsage(metadata: unknown): boolean {
  return isRecord(metadata) && metadata.token_usage_estimated === true;
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
