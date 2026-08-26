"use client";

import * as React from "react";
import { DashboardShell, useSidebarConfig } from "@lexmount.com/abyss-ui";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";

interface BaseLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  headerAction?: React.ReactNode;
}

export function BaseLayout({
  children,
  title,
  description,
  headerAction,
}: BaseLayoutProps) {
  const { config } = useSidebarConfig();

  return (
    <DashboardShell
      side={config.side}
      collapsible={config.collapsible}
      sidebar={
        <AppSidebar
          variant={config.variant}
          collapsible={config.collapsible}
          side={config.side}
        />
      }
      header={<SiteHeader />}
      title={title}
      description={description}
      headerAction={headerAction}
    >
      {children}
    </DashboardShell>
  );
}
