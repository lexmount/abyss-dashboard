import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider, useSidebar } from "@lexmount.com/abyss-ui";
import { FoldSidebarWhileAway } from "@/components/layouts/fold-sidebar";

let report: IntersectionObserverCallback = () => undefined;

/** Moves the target: out of view at 0, partly back below 1, all back at 1. */
function scrollTarget(ratio: number) {
  act(() =>
    report(
      [
        {
          isIntersecting: ratio > 0,
          intersectionRatio: ratio,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    ),
  );
}

function SidebarState() {
  return <output>{useSidebar().state}</output>;
}

function Page() {
  const target = React.useRef<HTMLDivElement>(null);
  return (
    <SidebarProvider>
      <FoldSidebarWhileAway target={target} />
      <div ref={target} />
      <SidebarState />
    </SidebarProvider>
  );
}

const state = () => screen.getByRole("status").textContent;
const toggleByHand = () =>
  act(() => void fireEvent.keyDown(window, { key: "b", metaKey: true }));

describe("FoldSidebarWhileAway", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          report = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("folds once the target is gone and opens once it is all back", () => {
    render(<Page />);
    scrollTarget(1);
    expect(state()).toBe("expanded");
    scrollTarget(0.4);
    expect(state()).toBe("expanded");
    scrollTarget(0);
    expect(state()).toBe("collapsed");
    scrollTarget(0.4);
    expect(state()).toBe("collapsed");
    scrollTarget(1);
    expect(state()).toBe("expanded");
  });

  it("leaves a sidebar collapsed by hand collapsed", () => {
    render(<Page />);
    toggleByHand();
    scrollTarget(0);
    scrollTarget(1);
    expect(state()).toBe("collapsed");
  });

  it("leaves a sidebar opened by hand open until the target leaves again", () => {
    render(<Page />);
    scrollTarget(0);
    toggleByHand();
    expect(state()).toBe("expanded");
    scrollTarget(0.4);
    scrollTarget(1);
    expect(state()).toBe("expanded");
    scrollTarget(0);
    expect(state()).toBe("collapsed");
    // Collapsed by hand after that, it stays collapsed when the target is back.
    toggleByHand();
    toggleByHand();
    scrollTarget(1);
    expect(state()).toBe("collapsed");
  });
});
