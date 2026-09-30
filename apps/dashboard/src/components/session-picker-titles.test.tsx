import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/i18n-context";
import { SessionPicker } from "./session-picker";

const { listSessionsMock } = vi.hoisted(() => ({ listSessionsMock: vi.fn() }));

vi.mock("@/api/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/usage")>();
  return { ...actual, listSessions: listSessionsMock };
});

describe("SessionPicker titles", () => {
  beforeEach(() => {
    window.localStorage.setItem("abyss-ui-language", "en");
    // jsdom has no layout, so keyboard scrolling is a no-op here.
    Element.prototype.scrollIntoView = vi.fn();
    listSessionsMock.mockResolvedValue({
      total_sessions: 2,
      page: 1,
      page_size: 50,
      has_more: false,
      items: [
        listItem("titled-session", "Draw a pelican", "title_generation"),
        listItem("untitled-session", null, null),
      ],
    });
  });

  afterEach(() => {
    cleanup();
    listSessionsMock.mockReset();
  });

  it("names sessions by their captured title and filters on it", async () => {
    const onChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <SessionPicker value="" onChange={onChange} scope={{}} />
        </I18nProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Session" }));
    expect(await screen.findByText("Draw a pelican")).toBeInTheDocument();
    expect(screen.getByText("Title generation")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);

    await userEvent.type(screen.getByRole("textbox"), "pelican");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await userEvent.click(screen.getByText("Draw a pelican"));
    expect(onChange).toHaveBeenCalledWith("titled-session");
  });
});

function listItem(sessionId: string, title: string | null, purpose: string | null) {
  return {
    session_pk: `${sessionId}-pk`,
    session_id: sessionId,
    agent_name: "codex",
    agent_version: null,
    host_name: "alice-mbp",
    platform: "macos",
    started_at: "2026-09-01T00:00:00Z",
    ended_at: null,
    last_activity_at: "2026-09-02T00:00:00Z",
    turns: 1,
    events: 2,
    total_tokens: 100,
    title,
    purpose,
  };
}
