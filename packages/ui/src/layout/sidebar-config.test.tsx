import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SidebarConfigProvider, useSidebarConfig } from "./sidebar-config";

describe("SidebarConfigProvider", () => {
  afterEach(() => {
    cleanup();
  });

  it("provides stable defaults and merges partial updates", () => {
    render(
      <SidebarConfigProvider>
        <ConfigProbe />
      </SidebarConfigProvider>,
    );

    expect(screen.getByTestId("config")).toHaveTextContent(
      "inset/offcanvas/left",
    );

    fireEvent.click(screen.getByRole("button", { name: "Move right" }));
    expect(screen.getByTestId("config")).toHaveTextContent(
      "inset/offcanvas/right",
    );
  });
});

function ConfigProbe() {
  const { config, updateConfig } = useSidebarConfig();

  return (
    <>
      <div data-testid="config">
        {config.variant}/{config.collapsible}/{config.side}
      </div>
      <button type="button" onClick={() => updateConfig({ side: "right" })}>
        Move right
      </button>
    </>
  );
}
