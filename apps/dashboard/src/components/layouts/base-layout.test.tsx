import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseLayout } from "@/components/layouts/base-layout";
import { I18nProvider } from "@/contexts/i18n-context";
import { SidebarConfigProvider } from "@lexmount.com/abyss-ui";

describe("BaseLayout", () => {
  beforeEach(() => {
    window.localStorage.setItem("abyss-ui-language", "zh");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: window.innerWidth < 768,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders and toggles the workspace sidebar without admin or account navigation", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <I18nProvider>
          <SidebarConfigProvider>
            <BaseLayout title="Agent 看板">内容</BaseLayout>
          </SidebarConfigProvider>
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /AbyssAgent 活动控制台/ })).toBeVisible();
    expect(screen.getByRole("link", { name: "Agent 看板" })).toBeVisible();
    expect(screen.getByRole("link", { name: "会话" })).toBeVisible();
    expect(screen.queryByText("管理")).not.toBeInTheDocument();
    expect(screen.queryByText("账号")).not.toBeInTheDocument();

    const sidebar = document.querySelector(
      '[data-slot="sidebar"][data-state="expanded"]',
    );
    expect(sidebar).toBeInTheDocument();

    const sidebarTrigger = screen.getByRole("button", { name: "Toggle Sidebar" });
    fireEvent.click(sidebarTrigger);
    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    fireEvent.click(sidebarTrigger);
    expect(sidebar).toHaveAttribute("data-state", "expanded");
  });

  it("opens the workspace navigation as a drawer on mobile", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 500,
    });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <I18nProvider>
          <SidebarConfigProvider>
            <BaseLayout title="Agent 看板">内容</BaseLayout>
          </SidebarConfigProvider>
        </I18nProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    const drawer = screen.getByRole("dialog", { name: "Sidebar" });
    expect(within(drawer).getByRole("link", { name: "Agent 看板" })).toBeVisible();
    expect(within(drawer).getByRole("link", { name: "会话" })).toBeVisible();
  });
});
