"use client";

import * as React from "react";
import {
  defaultLanguage,
  languageOptions,
  messages,
  type Language,
  type MessageKey,
} from "@/i18n/messages";

const storageKey = "abyss-ui-language";
const dictionaries: Record<Language, Record<MessageKey, string>> = messages;

type TranslationValues = Record<string, string | number>;

interface I18nContextValue {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, values?: TranslationValues) => string;
  formatNumber: (value: number) => string;
  formatDateTime: (value: string | Date) => string;
}

export const I18nContext = React.createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>(() =>
    initialLanguage(),
  );
  const locale =
    languageOptions.find((option) => option.value === language)?.locale ?? "zh-CN";

  React.useEffect(() => {
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(storageKey, language);
    } catch {
      // Language switching still works in-memory when storage is unavailable.
    }
  }, [language, locale]);

  const setLanguage = React.useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
  }, []);

  const t = React.useCallback(
    (key: MessageKey, values: TranslationValues = {}) => {
      const template =
        dictionaries[language][key] ?? dictionaries[defaultLanguage][key] ?? key;
      return Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        template,
      );
    },
    [language],
  );

  const formatNumber = React.useCallback(
    (value: number) => new Intl.NumberFormat(locale).format(value),
    [locale],
  );

  const formatDateTime = React.useCallback(
    (value: string | Date) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value)),
    [locale],
  );

  const value = React.useMemo<I18nContextValue>(
    () => ({
      language,
      locale,
      setLanguage,
      t,
      formatNumber,
      formatDateTime,
    }),
    [formatDateTime, formatNumber, language, locale, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function initialLanguage(): Language {
  if (typeof window === "undefined") {
    return defaultLanguage;
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (isLanguage(stored)) {
      return stored;
    }
  } catch {
    // Fall back to browser language if persisted preferences cannot be read.
  }

  const browserLanguage = window.navigator.language.toLowerCase();
  if (browserLanguage.startsWith("ja")) {
    return "ja";
  }
  if (browserLanguage.startsWith("en")) {
    return "en";
  }
  return defaultLanguage;
}

function isLanguage(value: string | null): value is Language {
  return languageOptions.some((option) => option.value === value);
}
