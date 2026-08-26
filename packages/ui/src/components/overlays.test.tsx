import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { LoadingSpinner } from "./loading-spinner";
import { LanguageMenu } from "./language-menu";
import { ModeToggleButton } from "./mode-toggle-button";

describe("shared overlay and feedback primitives", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens and closes an accessible dialog", () => {
    render(
      <Dialog>
        <DialogTrigger>Open details</DialogTrigger>
        <DialogContent>
          <DialogTitle>Session details</DialogTitle>
          <DialogDescription>Audit context</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open details" }));
    expect(
      screen.getByRole("dialog", { name: "Session details" }),
    ).toBeVisible();
    expect(screen.getByText("Audit context")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("dialog", { name: "Session details" }),
    ).toBeNull();
  });

  it("renders each supported loading spinner size", () => {
    const { rerender } = render(<LoadingSpinner size="sm" />);
    expect(document.querySelector(".animate-spin")).toHaveClass("h-4", "w-4");

    rerender(<LoadingSpinner size="md" />);
    expect(document.querySelector(".animate-spin")).toHaveClass("h-8", "w-8");

    rerender(<LoadingSpinner size="lg" />);
    expect(document.querySelector(".animate-spin")).toHaveClass("h-12", "w-12");
  });

  it("renders application-supplied language labels", () => {
    render(
      <LanguageMenu
        value="zh"
        options={[
          { value: "zh", nativeLabel: "中文" },
          { value: "en", nativeLabel: "English" },
        ]}
        triggerLabel="选择语言"
        menuLabel="语言"
        onValueChange={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "选择语言" })).toBeVisible();
  });

  it("renders the next theme action and delegates clicks", () => {
    let clicks = 0;
    const { rerender } = render(
      <ModeToggleButton isDarkMode={false} onClick={() => (clicks += 1)} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );
    expect(clicks).toBe(1);

    rerender(<ModeToggleButton isDarkMode onClick={() => (clicks += 1)} />);
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeVisible();
  });
});
