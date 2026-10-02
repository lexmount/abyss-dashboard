import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/i18n-context";
import { MultiSelectFilter, type FilterOption } from "./multi-select-filter";

const models: FilterOption[] = ["gpt-5", "gpt-5-mini", "claude-opus"].map((value) => ({
  value,
  label: value,
}));

function Harness({
  initial = [],
  options = models,
}: {
  initial?: string[];
  options?: FilterOption[];
}) {
  const [value, setValue] = React.useState<string[]>(initial);
  return (
    <I18nProvider>
      <MultiSelectFilter
        label="Model"
        options={options}
        value={value}
        onChange={setValue}
      />
    </I18nProvider>
  );
}

describe("MultiSelectFilter", () => {
  beforeEach(() => {
    window.localStorage.setItem("abyss-ui-language", "en");
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("chooses several values and summarizes them on the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Model" });
    expect(trigger).toHaveTextContent("All");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "gpt-5-mini" }));
    await user.click(screen.getByRole("option", { name: "claude-opus" }));

    expect(screen.getByRole("option", { name: "gpt-5-mini" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(trigger).toHaveTextContent("gpt-5-mini+1");
    expect(trigger).toHaveAttribute("title", "gpt-5-mini, claude-opus");
  });

  it("toggles a chosen value off and clears back to all", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["gpt-5", "claude-opus"]} />);
    const trigger = screen.getByRole("combobox", { name: "Model" });

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "gpt-5" }));
    expect(trigger).toHaveTextContent("claude-opus");

    await user.click(screen.getByRole("option", { name: "All" }));
    expect(trigger).toHaveTextContent("All");
    expect(screen.queryByRole("button", { name: "Clear Model filter" })).toBeNull();
  });

  it("clears every value from the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["gpt-5", "claude-opus"]} />);

    await user.click(screen.getByRole("button", { name: "Clear Model filter" }));
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent("All");
  });

  it("searches long lists and toggles the highlighted value with Enter", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, index) => ({
      value: `model-${index}`,
      label: `model-${index}`,
    }));
    render(<Harness options={many} />);

    await user.click(screen.getByRole("combobox", { name: "Model" }));
    await user.type(screen.getByRole("textbox", { name: "Search Model" }), "model-1");
    // "All" plus model-1, model-10, and model-11.
    expect(screen.getAllByRole("option")).toHaveLength(4);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent(
      "model-1",
    );
  });
});
