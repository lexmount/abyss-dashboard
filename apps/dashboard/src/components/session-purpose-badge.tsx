import { Badge } from "@lexmount.com/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";
import type { MessageKey } from "@/i18n/messages";

const purposeLabels: Record<string, MessageKey> = {
  title_generation: "sessions.purpose.title_generation",
};

/** Marks sessions that exist for a side task, such as naming another session. */
export function SessionPurposeBadge({ purpose }: { purpose: string | null }) {
  const { t } = useI18n();
  if (!purpose) {
    return null;
  }
  const label = purposeLabels[purpose];
  return (
    <Badge variant="secondary" className="shrink-0 text-[11px]">
      {label ? t(label) : purpose}
    </Badge>
  );
}
