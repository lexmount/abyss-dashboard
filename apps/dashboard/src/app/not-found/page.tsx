import { Link } from "react-router-dom";
import { Button } from "@lexmount/abyss-ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lexmount/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";

export default function NotFoundPage() {
  const { t } = useI18n();

  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("notFound.title")}</CardTitle>
          <CardDescription>{t("notFound.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/dashboard">{t("common.backToDashboard")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
