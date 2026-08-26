"use client";

import * as React from "react";
import { LayoutDashboard, TerminalSquare } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@lexmount.com/abyss-ui";
import { NavMain } from "@/components/nav-main";
import { useI18n } from "@/hooks/use-i18n";
import { assetUrl } from "@/lib/utils";

const abyssIconUrl = assetUrl("abyss-icon.png");

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useI18n();
  const navGroups = [
    {
      label: t("nav.workspace"),
      items: [
        {
          title: t("common.dashboard"),
          url: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          title: t("nav.sessions"),
          url: "/sessions",
          icon: TerminalSquare,
        },
      ],
    },
  ];

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-transparent p-0">
                  <img src={abyssIconUrl} alt="" className="size-full object-contain" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Abyss</span>
                  <span className="truncate text-xs">{t("nav.agentUsageConsole")}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <NavMain key={group.label} label={group.label} items={group.items} />
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
