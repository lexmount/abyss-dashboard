import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "../components/sidebar";
import { DashboardHeader, DashboardShell } from "./dashboard-shell";

describe("DashboardShell", () => {
  beforeEach(() => {
    setViewportWidth(1024);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the shared desktop shell and toggles its sidebar", async () => {
    render(
      <DashboardShell
        sidebar={<Sidebar>Navigation</Sidebar>}
        header={<DashboardHeader>Header actions</DashboardHeader>}
        title="Agent dashboard"
        description="Usage and sessions"
        headerAction={<button type="button">Export</button>}
      >
        Main content
      </DashboardShell>,
    );

    expect(
      screen.getByRole("heading", { name: "Agent dashboard" }),
    ).toBeVisible();
    expect(screen.getByText("Usage and sessions")).toBeVisible();
    expect(screen.getByRole("button", { name: "Export" })).toBeVisible();
    expect(screen.getByText("Header actions")).toBeVisible();
    expect(screen.getByText("Main content")).toBeVisible();

    const sidebar = document.querySelector('[data-slot="sidebar"]');
    await waitFor(() =>
      expect(sidebar).toHaveAttribute("data-state", "expanded"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(sidebar).toHaveAttribute("data-state", "collapsed");

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(sidebar).toHaveAttribute("data-state", "expanded");
  });

  it("orders a right sidebar after the main content", () => {
    render(
      <DashboardShell
        side="right"
        collapsible="none"
        sidebar={<Sidebar collapsible="none">Navigation</Sidebar>}
        header={<DashboardHeader>Header actions</DashboardHeader>}
      >
        Main content
      </DashboardShell>,
    );

    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
    expect(wrapper).toHaveClass("sidebar-none-mode");
    expect(wrapper?.children[0]).toHaveAttribute("data-slot", "sidebar-inset");
    expect(wrapper?.children[1]).toHaveAttribute("data-slot", "sidebar");
  });

  it("opens the shared sidebar as a mobile drawer", async () => {
    setViewportWidth(500);

    render(
      <DashboardShell
        sidebar={<Sidebar>Navigation</Sidebar>}
        header={<DashboardHeader>Header actions</DashboardHeader>}
      >
        Main content
      </DashboardShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(
      await screen.findByRole("dialog", { name: "Sidebar" }),
    ).toBeVisible();
    expect(screen.getByText("Navigation")).toBeVisible();
  });
});

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: width < 768,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
