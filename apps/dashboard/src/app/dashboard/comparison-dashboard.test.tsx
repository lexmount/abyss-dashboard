import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  UsageComparisonChart,
  UsageActivityHeatmap,
  UsageComparisonData,
} from "@lexmount.com/abyss-ui";
import { fetchJson } from "@/api/http";
import { I18nProvider } from "@/contexts/i18n-context";
import { ComparisonDashboard } from "./comparison-dashboard";

vi.mock("@/api/http", () => ({ fetchJson: vi.fn() }));
vi.mock("@lexmount.com/abyss-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lexmount.com/abyss-ui")>()),
  UsageComparisonChart: (props: ComponentProps<typeof UsageComparisonChart>) => (
    <div data-testid="comparison" aria-busy={props.status.updating}>
      <output data-testid="comparison-data">
        {JSON.stringify({ buckets: props.buckets, data: props.data })}
      </output>
      <button onClick={() => props.onChange({ ...props.selection, range: "24h" })}>
        Change range
      </button>
    </div>
  ),
  UsageActivityHeatmap: (props: ComponentProps<typeof UsageActivityHeatmap>) => (
    <div data-testid="activity" aria-busy={props.status.updating}>
      <output data-testid="activity-data">
        {JSON.stringify({ buckets: props.buckets, data: props.data })}
      </output>
      <button onClick={() => props.onChange({ ...props.filters, platform: ["linux"] })}>
        Change platform
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function response(tokens: number): UsageComparisonData {
  return {
    rows: [{ bucket: 0, value: "codex", total_tokens: tokens, requests: 1 }],
    options: [],
  };
}

it("keeps rows paired with their previous time axis and retains heatmap data while fetching", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(fetchJson).mockResolvedValue(response(100));
  render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <ComparisonDashboard />
      </I18nProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("comparison")).toHaveAttribute("aria-busy", "false"),
  );
  await waitFor(() =>
    expect(screen.getByTestId("activity")).toHaveAttribute("aria-busy", "false"),
  );
  const previousChart = screen.getByTestId("comparison-data").textContent;
  const previousActivity = screen.getByTestId("activity-data").textContent;
  let complete: (value: UsageComparisonData) => void = () => {};
  vi.mocked(fetchJson).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );

  fireEvent.click(screen.getByRole("button", { name: "Change range" }));
  await waitFor(() =>
    expect(screen.getByTestId("comparison")).toHaveAttribute("aria-busy", "true"),
  );
  expect(screen.getByTestId("comparison-data").textContent).toBe(previousChart);
  expect(screen.getByTestId("activity-data").textContent).toBe(previousActivity);
  complete(response(200));
  await waitFor(() =>
    expect(screen.getByTestId("comparison")).toHaveAttribute("aria-busy", "false"),
  );
  const updated = JSON.parse(screen.getByTestId("comparison-data").textContent!);
  expect(updated.buckets).toHaveLength(24);
  expect(updated.data.rows[0].total_tokens).toBe(200);

  fireEvent.click(screen.getByRole("button", { name: "Change platform" }));
  await waitFor(() =>
    expect(screen.getByTestId("activity")).toHaveAttribute("aria-busy", "true"),
  );
  expect(screen.getByTestId("activity-data").textContent).toBe(previousActivity);
  complete(response(300));
  await waitFor(() =>
    expect(screen.getByTestId("activity")).toHaveAttribute("aria-busy", "false"),
  );
  expect(screen.getByTestId("activity-data")).toHaveTextContent('"total_tokens":300');
  client.clear();
});

it("does not carry the previous owner's snapshot into a different authorization scope", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(fetchJson).mockResolvedValue(response(12345));
  const view = (scope: "mine" | "global") => (
    <QueryClientProvider client={client}>
      <I18nProvider>
        <ComparisonDashboard scope={scope} />
      </I18nProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(view("mine"));
  await waitFor(() =>
    expect(screen.getByTestId("comparison-data")).toHaveTextContent(
      '"total_tokens":12345',
    ),
  );
  vi.mocked(fetchJson).mockImplementation(() => new Promise(() => {}));
  rerender(view("global"));
  await waitFor(() =>
    expect(screen.getByTestId("comparison")).toHaveAttribute("aria-busy", "true"),
  );
  expect(screen.getByTestId("comparison-data")).not.toHaveTextContent(
    '"total_tokens":12345',
  );
  expect(screen.getByTestId("activity-data")).not.toHaveTextContent(
    '"total_tokens":12345',
  );
  client.clear();
});
