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
    summary: (turns) => t("sessions.streams.turnCount", { count: turns }),
    timeline: t("sessions.streams.timeline"),
    turnNumber: (number) => t("sessions.event.turnNumber", { number }),
    noTurn: t("sessions.event.noTurn"),
    segmentExchanges: (count) => t("sessions.streams.exchanges", { count }),
    segmentMatches: (count) => t("sessions.streams.searchMatches", { count }),
    noUserInput: t("sessions.streams.noUserInput"),
    newContext: t("sessions.streams.newContext"),
    mainLine: t("sessions.streams.mainLine"),
    line: (number) => t("sessions.streams.line", { number }),
    subagent: t("sessions.streams.subagent"),
    sideRequests: (count) => t("sessions.streams.sideRequests", { count }),
    loading: t("sessions.detail.loading"),
    request: t("common.request"),
    response: t("common.response"),
    requestMissing: t("sessions.streams.requestMissing"),
    responseMissing: t("sessions.streams.responseMissing"),
    noEntries: t("sessions.streams.noEntries"),
    unknownModel: t("sessions.streams.unknownModel"),
    tokens: t("common.tokens"),
    tokensUnavailable: t("sessions.streams.tokensUnavailable"),
    incomplete: (completeness) => t("sessions.event.incomplete", { completeness }),
    newPart: t("sessions.streams.newPart"),
    backToTop: t("sessions.streams.backToTop"),
    loadingConversation: t("sessions.event.loading"),
    omitted: (count) => t("sessions.streams.omitted", { count }),
    omittedMatches: (count, matches) =>
      t("sessions.streams.omittedMatches", { count, matches }),
    loadError: (error) =>
      t("sessions.event.error", {
        message: t(`error.${apiErrorKind(error)}.title`),
      }),
    showMore: t("sessions.streams.showMore"),
    showLess: t("sessions.streams.showLess"),
    characters: (count) => t("sessions.event.characters", { count }),
    showRest: (count) => t("sessions.event.showMore", { count }),
    roleSystem: t("sessions.event.roleSystem"),
    roleDeveloper: t("sessions.event.roleDeveloper"),
    roleUser: t("sessions.event.roleUser"),
    roleAssistant: t("sessions.event.roleAssistant"),
    roleReasoning: t("sessions.event.roleReasoning"),
    roleToolCall: t("sessions.detail.toolCall"),
    roleToolResult: t("sessions.detail.toolResult"),
    roleUnknown: t("sessions.event.roleUnknown"),
  };
}

/** A turn's name by its number, or the stand-in for an event in no turn. */
export function turnName(
  t: Translate,
  formatNumber: (value: number) => string,
  turn: number | null,
): string {
  return turn === null
    ? t("sessions.event.noTurn")
    : t("sessions.event.turnNumber", { number: formatNumber(turn) });
}

/** Translated labels for the session search field. */
export function streamSearchBoxLabels(t: Translate): StreamSearchBoxLabels {
  return {
    search: t("sessions.streams.search"),
    position: (current, total) =>
      t("sessions.streams.searchPosition", { current, total }),
    jump: t("sessions.streams.searchJump"),
    noMatches: t("sessions.streams.searchNoMatches"),
    previous: t("sessions.streams.searchPrevious"),
    next: t("sessions.streams.searchNext"),
    clear: t("sessions.streams.searchClear"),
  };
}
