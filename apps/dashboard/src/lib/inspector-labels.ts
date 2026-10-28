import type { SessionEventInspectorLabels } from "@lexmount.com/abyss-ui";
import type { useI18n } from "@/hooks/use-i18n";

/** Translated labels for the event inspector. */
export function eventInspectorLabels(
  t: ReturnType<typeof useI18n>["t"],
): SessionEventInspectorLabels {
  return {
    title: t("sessions.event.title"),
    request: t("common.request"),
    response: t("common.response"),
    close: t("sessions.event.close"),
    resize: t("sessions.event.resize"),
    loading: t("sessions.event.loading"),
    error: (message) => t("sessions.event.error", { message }),
    copy: t("sessions.event.copy"),
    noText: t("sessions.event.noText"),
    tabContent: t("sessions.event.tabContent"),
    tabAttachments: t("sessions.event.tabAttachments"),
    tabRequestHeaders: t("sessions.event.tabRequestHeaders"),
    tabResponseHeaders: t("sessions.event.tabResponseHeaders"),
    tabProperties: t("sessions.event.tabProperties"),
    toolCall: t("sessions.detail.toolCall"),
    toolResult: t("sessions.detail.toolResult"),
    callId: t("sessions.detail.callId"),
    imageContentHidden: t("sessions.detail.imageContentHidden"),
    imageLabel: (index) => t("sessions.detail.imageLabel", { index }),
    openImage: (label) => t("sessions.detail.openImage", { label }),
    base64: t("sessions.event.base64"),
    raw: t("sessions.event.raw"),
    requestPath: t("sessions.event.requestPath"),
    roleSystem: t("sessions.event.roleSystem"),
    roleDeveloper: t("sessions.event.roleDeveloper"),
    roleUser: t("sessions.event.roleUser"),
    roleAssistant: t("sessions.event.roleAssistant"),
    roleReasoning: t("sessions.event.roleReasoning"),
    roleUnknown: t("sessions.event.roleUnknown"),
    systemPrompt: t("sessions.event.systemPrompt"),
    showMore: (count) => t("sessions.event.showMore", { count }),
    showLess: t("sessions.event.showLess"),
    incomplete: (completeness) => t("sessions.event.incomplete", { completeness }),
  };
}
