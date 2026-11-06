"use client";

import * as React from "react";
import {
  DashboardShell,
  useSidebarConfig,
  type SidebarConfig,
} from "@lexmount.com/abyss-ui";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { FoldSidebarWhileAway } from "@/components/layouts/fold-sidebar";

interface BaseLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  headerAction?: React.ReactNode;
  /** How this page's sidebar collapses. */
  sidebar?: { collapsible?: SidebarConfig["collapsible"] };
  /** While this element is out of view, the sidebar folds away. */
  foldSidebarWhileAway?: React.RefObject<HTMLElement | null>;
}

export function BaseLayout({
  children,
  title,
  description,
  headerAction,
  sidebar,
  foldSidebarWhileAway,
}: BaseLayoutProps) {
  const { config } = useSidebarConfig();
  const collapsible = sidebar?.collapsible ?? config.collapsible;

  return (
    <DashboardShell
      side={config.side}
      collapsible={collapsible}
      sidebar={
        <AppSidebar
          variant={config.variant}
          collapsible={collapsible}
          side={config.side}
        />
      }
      header={<SiteHeader />}
      title={title}
      description={description}
      headerAction={headerAction}
    >
      {foldSidebarWhileAway ? (
        <FoldSidebarWhileAway target={foldSidebarWhileAway} />
      ) : null}
      {children}
    </DashboardShell>
  );
}
