import * as React from "react";
import { cn } from "../utils";
import type { SessionStreamsLabels } from "./labels";
import { laneColor, type StreamLayout, type TimelineRow } from "./layout";

/** The labels the timeline uses. */
export type StreamTimelineLabels = Pick<
  SessionStreamsLabels,
  | "timeline"
  | "segmentNumber"
  | "segmentExchanges"
  | "segmentMatches"
  | "noUserInput"
  | "continuesSegment"
>;

export interface StreamTimelineProps {
  layout: StreamLayout;
  /** Head of the segment shown. */
  selected: string | null;
  onSelect: (head: string) => void;
  formatTime: (value: string) => string;
  formatDateTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: StreamTimelineLabels;
  /** Search occurrences per segment head while searching, else null. */
  matches?: ReadonlyMap<string, number> | null;
  className?: string;
}

/** Distance between two lanes. */
const lanePx = 14;
/** Room before the first lane and after the last one. */
const edgePx = 12;
/** A row's dot sits this far below the row's top: its padding and half a line. */
const dotYPx = 17;

/**
 * The session's segments, one row each, with the streams they form drawn in
 * the gutter: a continuation stays in its lane, the longest branch of a fork
 * goes straight on while the others bend out into lanes of their own.
 * Selecting a row shows that segment. While the session is searched, each
 * segment shows its matches, and the ones without any fade.
 */
export function StreamTimeline({
  layout,
  selected,
  onSelect,
  formatTime,
  formatDateTime,
  formatNumber,
  labels,
  matches = null,
  className,
}: StreamTimelineProps) {
  const { rows } = layout;
  const gutter = React.useMemo(() => gutterOf(layout.lanes), [layout.lanes]);
  const position = Math.max(
    0,
    rows.findIndex((row) => row.segment.head === selected),
  );

  const boxRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLOListElement>(null);
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  // Brings the selected row into view within the timeline only; the page
  // itself stays where it is.
  React.useEffect(() => {
    const box = boxRef.current;
    const node = selectedRef.current;
    if (!box || !node) {
      return;
    }
    const top =
      node.getBoundingClientRect().top - box.getBoundingClientRect().top;
    const bottom = top + node.offsetHeight;
    if (top < 0) {
      box.scrollTop += top - 8;
    } else if (bottom > box.clientHeight) {
      box.scrollTop += bottom - box.clientHeight + 8;
    }
  }, [selected]);

  // Rows wrap their labels, so the gutter is drawn from where they ended up.
  const [tops, setTops] = React.useState<number[]>([]);
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const measure = () => {
      const next = Array.from(
        list.querySelectorAll<HTMLElement>(":scope > li"),
        (item) => item.offsetTop,
      );
      setTops((current) =>
        current.length === next.length &&
        current.every((top, index) => top === next[index])
          ? current
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [rows]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowDown" || event.key === "j"
        ? 1
        : event.key === "ArrowUp" || event.key === "k"
          ? -1
          : 0;
    if (step === 0) {
      return;
    }
    const next = rows[position + step];
    if (next !== undefined) {
      onSelect(next.segment.head);
    }
    event.preventDefault();
  };

  // Contained, so moving the whole box (the sidebar opening or collapsing
  // shifts it) does not walk its rows, of which a large session has thousands.
  return (
    <div
      ref={boxRef}
      role="listbox"
      aria-label={labels.timeline}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        "bg-muted/30 focus-visible:ring-ring/40 overflow-auto px-1.5 py-2 outline-none contain-content focus-visible:ring-2 focus-visible:ring-inset",
        className,
      )}
    >
      <ol ref={listRef} className="relative">
        {rows.map((row, index) => {
          const isSelected = position === index;
          return (
            <li key={row.segment.head}>
              <button
                ref={isSelected ? selectedRef : undefined}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-segment={row.segment.head}
                onClick={() => onSelect(row.segment.head)}
                className={cn(
                  rowClass(isSelected),
                  matches && !matches.has(row.segment.head) && "opacity-45",
                )}
                style={{ paddingLeft: gutter.indent }}
              >
                <TimelineRowContent
                  row={row}
                  ordinalOf={layout.ordinalOf}
                  selected={isSelected}
                  matchCount={
                    matches === null
                      ? null
                      : (matches.get(row.segment.head) ?? 0)
                  }
                  formatTime={formatTime}
                  formatDateTime={formatDateTime}
                  formatNumber={formatNumber}
                  labels={labels}
                />
              </button>
            </li>
          );
        })}
        {tops.length === rows.length ? (
          <Gutter rows={rows} tops={tops} gutter={gutter} selected={selected} />
        ) : null}
      </ol>
    </div>
  );
}

function rowClass(selected: boolean): string {
  return cn(
    "relative block w-full rounded-lg py-2 pr-2 text-left transition-colors",
    selected ? "bg-ring/10" : "hover:bg-muted/70",
  );
}

function TimelineRowContent({
  row,
  ordinalOf,
  selected,
  matchCount,
  formatTime,
  formatDateTime,
  formatNumber,
  labels,
}: {
  row: TimelineRow;
  ordinalOf: ReadonlyMap<string, number>;
  selected: boolean;
  /** Search occurrences in the segment while searching, else null. */
  matchCount: number | null;
  formatTime: (value: string) => string;
  formatDateTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: StreamTimelineLabels;
}) {
  const { segment } = row;
  const parent =
    segment.parent === null ? undefined : ordinalOf.get(segment.parent);
  return (
    <>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
        <span
          className={cn(
            "font-medium whitespace-nowrap",
            selected && "text-ring",
          )}
        >
          {labels.segmentNumber(formatNumber(row.ordinal + 1))}
        </span>
        <span
          className="text-muted-foreground whitespace-nowrap tabular-nums"
          title={formatDateTime(segment.start)}
        >
          {formatTime(segment.start)}
        </span>
        <span className="ml-auto flex flex-wrap justify-end gap-1">
          {matchCount !== null && matchCount > 0 ? (
            <Pill className="bg-ring/15 text-ring font-medium">
              {labels.segmentMatches(formatNumber(matchCount))}
            </Pill>
          ) : null}
          {/* While searching, the hits take the exchange count's place. */}
          {matchCount === null ? (
            <Pill>
              {labels.segmentExchanges(formatNumber(segment.exchange_count))}
            </Pill>
          ) : null}
        </span>
      </span>
      {/* The segment's new user words on one line, the backend's start of
          them on hover; without any, where the segment comes from. */}
      {segment.label ? (
        <span
          className="text-muted-foreground mt-0.5 block truncate text-xs"
          title={segment.label.text}
        >
          {segment.label.text}
        </span>
      ) : (
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {parent === undefined
            ? labels.noUserInput
            : labels.continuesSegment(parent + 1)}
        </span>
      )}
    </>
  );
}

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground rounded-full px-1.5 py-px text-[10px] whitespace-nowrap tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}

interface GutterGeometry {
  /** Horizontal place of a lane's dots. */
  x: (lane: number) => number;
  /** Where a row starts its text, right after the lanes. */
  indent: number;
}

function gutterOf(lanes: number): GutterGeometry {
  const x = (lane: number) => edgePx + lane * lanePx;
  return { x, indent: x(Math.max(1, lanes) - 1) + edgePx };
}

/**
 * The lines and dots beside the rows. A segment joins the one it continues
 * in its own color, the color it carries on or the one its branch bends out
 * in; a side branch ending in one segment comes off that line just above its
 * own dot, beneath the line going on. A segment without a base has a hollow
 * dot, and one that ends in a fork point a heavy one.
 */
function Gutter({
  rows,
  tops,
  gutter,
  selected,
}: {
  rows: readonly TimelineRow[];
  /** Top of each row. */
  tops: readonly number[];
  gutter: GutterGeometry;
  /** Head of the selected segment. */
  selected: string | null;
}) {
  const dots = new Map(
    rows.map((row, index) => [
      row.segment.head,
      { x: gutter.x(row.lane), y: (tops[index] ?? 0) + dotYPx },
    ]),
  );
  const height = Math.max(0, ...tops) + dotYPx * 3;
  const parentDot = (row: TimelineRow) =>
    row.segment.parent === null ? undefined : dots.get(row.segment.parent);
  const selectedDot = selected === null ? undefined : dots.get(selected);
  return (
    <svg
      aria-hidden
      width={gutter.indent}
      height={height}
      className="pointer-events-none absolute top-0 left-0 z-[1] overflow-visible"
    >
      {/* Spurs first, so the line they come off is drawn over them. */}
      {rows.map((row) => {
        const to = dots.get(row.segment.head);
        const from = parentDot(row);
        if (!row.spur || !to || !from) {
          return null;
        }
        return (
          <path
            key={row.segment.head}
            data-spur={row.segment.head}
            d={lateBendPath(from.x, from.y, to.x, to.y)}
            fill="none"
            stroke={laneColor(row.color)}
            strokeWidth={2}
          />
        );
      })}
      {rows.map((row) => {
        const to = dots.get(row.segment.head);
        const from = row.spur ? undefined : parentDot(row);
        if (!to || !from) {
          return null;
        }
        return (
          <path
            key={row.segment.head}
            d={edgePath(from.x, from.y, to.x, to.y)}
            fill="none"
            stroke={laneColor(row.color)}
            strokeWidth={2}
          />
        );
      })}
      {selectedDot ? <Halo x={selectedDot.x} y={selectedDot.y} /> : null}
      {rows.map((row) => {
        const dot = dots.get(row.segment.head);
        if (!dot) {
          return null;
        }
        const hollow = row.segment.kind === "root";
        const fork = row.forks > 0;
        return (
          <circle
            key={row.segment.head}
            data-segment={row.segment.head}
            data-hollow={hollow || undefined}
            data-fork={fork || undefined}
            cx={dot.x}
            cy={dot.y}
            r={fork ? 5.5 : 4.5}
            fill={hollow ? "var(--card)" : laneColor(row.color)}
            stroke={laneColor(row.color)}
            strokeWidth={fork ? 3 : 2}
          />
        );
      })}
    </svg>
  );
}

/** The ring around the selected row's dot. */
function Halo({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={8.5} fill="var(--ring)" fillOpacity={0.2} />;
}

/**
 * Down the start's lane, then over to the end's just above its dot, so the
 * line stays clear of the rows in between: a spur off the line it branched
 * from.
 */
function lateBendPath(x1: number, y1: number, x2: number, y2: number): string {
  const turn = Math.max(y1, y2 - 24);
  return `M ${x1} ${y1} L ${x1} ${turn} C ${x1} ${turn + 16}, ${x2} ${y2 - 12}, ${x2} ${y2}`;
}

/** Straight down within a lane; into another lane, a curve just below the start. */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} C ${x1} ${y1 + 22}, ${x2} ${y1 + 8}, ${x2} ${y1 + 30} L ${x2} ${y2}`;
}
