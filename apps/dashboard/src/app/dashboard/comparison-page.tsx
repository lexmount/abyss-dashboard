import { BaseLayout } from "@/components/layouts/base-layout";
import { useI18n } from "@/hooks/use-i18n";
import { ComparisonDashboard } from "./comparison-dashboard";

export default function ComparisonPage() {
  const { t } = useI18n();
  return (
    <BaseLayout title={t("comparison.tab")}>
      <div className="@container/main px-4 lg:px-6">
        <ComparisonDashboard />
      </div>
    </BaseLayout>
  );
}
