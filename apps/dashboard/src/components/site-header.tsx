"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { DashboardHeader } from "@lexmount.com/abyss-ui";

export function SiteHeader() {
  return (
    <DashboardHeader>
      <LanguageSwitcher />
      <ModeToggle />
    </DashboardHeader>
  );
}
