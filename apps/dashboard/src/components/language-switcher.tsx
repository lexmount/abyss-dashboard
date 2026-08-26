"use client";

import { LanguageMenu } from "@lexmount.com/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";
import { languageOptions, type Language } from "@/i18n/messages";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();

  return (
    <LanguageMenu
      value={language}
      options={languageOptions}
      triggerLabel={t("language.select")}
      menuLabel={t("common.language")}
      onValueChange={(value) => setLanguage(value as Language)}
    />
  );
}
