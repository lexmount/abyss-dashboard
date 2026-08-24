import { I18nContext } from "@/contexts/i18n-context";
import * as React from "react";

export function useI18n() {
  const context = React.useContext(I18nContext);
  if (context === undefined) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
