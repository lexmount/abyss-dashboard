import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UsageComparisonChart } from "./comparison-chart";
import { UsageActivityHeatmap } from "./activity-heatmap";
import {
  defaultComparison,
  emptyUsageFilters,
  type UsageComparisonLabels,
} from "./comparison-model";

const labels: UsageComparisonLabels = {
  tokens: "Token comparison",
  activity: "Activity",
  dimension: "Compare by",
  dimensions: {
    agent: "Agent",
    model: "Model",
    provider: "Provider",
    platform: "Platform",
    session: "Session ID",
  },
  all: "All",
  search: "Search",
  empty: "No data",
  loading: "Loading",
  error: "Error",
  retry: "Retry",
  refresh: "Refresh",
  less: "Less",
  more: "More",
  invalidRange: "Invalid range",
  add: "Add",
  clear: "Clear",
  requests: "requests",
};
const status = {
  loading: false,
  updating: false,
  error: false,
  onRetry: vi.fn(),
};
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
afterEach(cleanup);

it("excludes the comparison dimension from filters and disables filtered comparison choices", () => {
  const selection = defaultComparison(new Date("2026-10-23T12:00:00Z"));
  selection.filters.provider = ["openai"];
  render(
    <UsageComparisonChart
      selection={selection}
      timeRangeControl={null}
      onChange={vi.fn()}
      buckets={[{ start: "2026-10-23T00:00:00Z", end: "2026-10-24T00:00:00Z" }]}
      status={status}
      labels={labels}
      locale="en-US"
    />,
  );
  expect(
    screen.queryByRole("combobox", { name: "Agent" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: "Session ID" }),
  ).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Compare by" }), {
    key: "Enter",
  });
  expect(screen.getByRole("option", { name: "Provider" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(
    screen.queryByRole("option", { name: "Session ID" }),
  ).not.toBeInTheDocument();
});

it("uses day totals for heatmap intensity and exposes zero days with keyboard navigation", () => {
  const buckets = Array.from({ length: 8 }, (_, index) => ({
    start: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
    end: new Date(Date.UTC(2026, 9, index + 2)).toISOString(),
  }));
  const { container } = render(
    <UsageActivityHeatmap
      filters={emptyUsageFilters()}
      onChange={vi.fn()}
      buckets={buckets}
      status={status}
      labels={labels}
      locale="en-US"
      data={{
        options: [],
        rows: [
          {
            bucket: Date.parse(buckets[0].start),
            value: "all",
            total_tokens: 100,
            requests: 2,
          },
        ],
      }}
    />,
  );
  const cells = container.querySelectorAll<HTMLButtonElement>(
    "[data-activity-day]",
  );
  expect(cells).toHaveLength(8);
  expect(cells[0]).toHaveAttribute("data-level", "4");
  expect(cells[1]).toHaveAttribute("data-level", "0");
  expect(cells[0]).toHaveAccessibleName(/100 Token · 2 requests/);
  fireEvent.keyDown(cells[0], { key: "ArrowRight" });
  expect(cells[7]).toHaveFocus();
  expect(
    screen.queryByRole("combobox", { name: "Session ID" }),
  ).not.toBeInTheDocument();
});
