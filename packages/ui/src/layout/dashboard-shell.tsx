import * as React from "react";

import { cn } from "../utils";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "../components/sidebar";

export interface DashboardShellProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  header: React.ReactNode;
  side?: "left" | "right";
  collapsible?: "offcanvas" | "icon" | "none";
  title?: React.ReactNode;
  description?: React.ReactNode;
  headerAction?: React.ReactNode;
  className?: string;
}

export function DashboardShell({
  children,
  sidebar,
  header,
  side = "left",
  collapsible = "offcanvas",
  title,
  description,
  headerAction,
  className,
}: DashboardShellProps) {
  const mainContent = (
    <SidebarInset>
      {header}
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {title ? (
              <div className="flex flex-col gap-4 px-4 sm:flex-row sm:items-start sm:justify-between lg:px-6">
                <div className="flex min-w-0 flex-col gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight">
                    {title}
                  </h1>
                  {description ? (
                    <p className="text-muted-foreground truncate">
                      {description}
                    </p>
                  ) : null}
                </div>
                {headerAction ? (
                  <div className="shrink-0">{headerAction}</div>
                ) : null}
              </div>
            ) : null}
            {children}
          </div>
        </div>
      </div>
    </SidebarInset>
  );

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3rem",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
      className={cn(collapsible === "none" && "sidebar-none-mode", className)}
    >
      {side === "left" ? (
        <>
          {sidebar}
          {mainContent}
        </>
      ) : (
        <>
          {mainContent}
          {sidebar}
        </>
      )}
    </SidebarProvider>
  );
}

export function DashboardHeader({
  children,
  className,
}: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="dashboard-header"
      className={cn(
        "flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)",
        className,
      )}
    >
      <div className="flex w-full items-center gap-1 px-4 py-3 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
