import type {
  SessionStreamsLabels,
  StreamSearchBoxLabels,
} from "@lexmount.com/abyss-ui";
import { apiErrorKind } from "@/api/http";
import type { useI18n } from "@/hooks/use-i18n";

type Translate = ReturnType<typeof useI18n>["t"];

/** Translated labels for the session stream view. */
export function sessionStreamsLabels(t: Translate): SessionStreamsLabels {
  return {
    summary: (segments) => t("sessions.streams.summary", { segments }),
    timeline: t("sessions.streams.list"),
    segmentNumber: (number) => t("sessions.event.segmentNumber", { number }),
    segmentExchanges: (count) => t("sessions.streams.exchanges", { count }),
    segmentMatches: (count) => t("sessions.streams.searchMatches", { count }),
    noUserInput: t("sessions.streams.noUserInput"),
    continuesSegment: (number) => t("sessions.streams.continuesSegment", { number }),
    subagent: t("sessions.streams.subagent"),
    derived: t("sessions.streams.derived"),
    byTime: t("sessions.streams.byTime"),
    spawned: t("sessions.streams.spawned"),
    loading: t("sessions.detail.loading"),
    noBase: (reason) => t("sessions.streams.noBase", { reason }),
    after: (exchange, rule) => t("sessions.streams.after", { exchange, rule }),
    request: t("common.request"),
    response: t("common.response"),
    requestMissing: t("sessions.streams.requestMissing"),
    responseMissing: t("sessions.streams.responseMissing"),
    noEntries: t("sessions.streams.noEntries"),
    unknownModel: t("sessions.trajectory.unknownModel"),
    tokens: t("common.tokens"),
    tokensUnavailable: t("sessions.trajectory.tokensUnavailable"),
    inputTokens: t("sessions.trajectory.inputTokens"),
    outputTokens: t("sessions.trajectory.outputTokens"),
    cacheReadTokens: t("sessions.trajectory.cacheReadTokens"),
    cacheWriteTokens: t("sessions.trajectory.cacheWriteTokens"),
    reasoningTokens: t("sessions.trajectory.reasoningTokens"),
    incomplete: (completeness) => t("sessions.event.incomplete", { completeness }),
    newPart: t("sessions.streams.newPart"),
    loadingConversation: t("sessions.event.loading"),
    omitted: (count) => t("sessions.streams.omitted", { count }),
    omittedMatches: (count, matches) =>
      t("sessions.streams.omittedMatches", { count, matches }),
    loadError: (error) =>
      t("sessions.event.error", {
        message: t(`error.${apiErrorKind(error)}.title`),
      }),
    showMore: t("sessions.trajectory.showMore"),
    showLess: t("sessions.trajectory.showLess"),
    characters: (count) => t("sessions.event.characters", { count }),
    showRest: (count) => t("sessions.event.showMore", { count }),
    input: t("sessions.trajectory.input"),
    output: t("sessions.trajectory.output"),
    noText: t("sessions.event.noText"),
    roleSystem: t("sessions.trajectory.system"),
    roleDeveloper: t("sessions.trajectory.developer"),
    roleUser: t("sessions.trajectory.user"),
    roleAssistant: t("sessions.trajectory.assistant"),
    roleReasoning: t("sessions.trajectory.reasoning"),
    roleToolCall: t("sessions.detail.toolCall"),
    roleToolResult: t("sessions.detail.toolResult"),
    roleUnknown: t("sessions.event.roleUnknown"),
  };
}

/** Translated labels for the session search field. */
export function streamSearchBoxLabels(t: Translate): StreamSearchBoxLabels {
  return {
    search: t("sessions.streams.search"),
    position: (current, total) =>
      t("sessions.streams.searchPosition", { current, total }),
    noMatches: t("sessions.streams.searchNoMatches"),
    previous: t("sessions.streams.searchPrevious"),
    next: t("sessions.streams.searchNext"),
    clear: t("sessions.streams.searchClear"),
  };
}
