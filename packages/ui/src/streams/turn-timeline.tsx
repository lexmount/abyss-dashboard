import * as React from "react";
import { cn } from "../utils";
import { turnName, type SessionStreamsLabels } from "./labels";
import { executorHead, turnHead, turnPlace } from "./turns";
import type { SessionTurn, StreamSegment, TurnExecutor } from "./types";

/** The labels the timeline uses. */
export type TurnTimelineLabels = Pick<
  SessionStreamsLabels,
  | "timeline"
  | "turnNumber"
  | "noTurn"
  | "segmentExchanges"
  | "segmentMatches"
  | "noUserInput"
  | "newContext"
  | "mainLine"
  | "subagent"
  | "sideRequests"
>;

export interface TurnTimelineProps {
  turns: readonly SessionTurn[];
  /** The session's segments by head, for the side requests' details. */
  segmentOf: ReadonlyMap<string, StreamSegment>;
  /** Head of the segment chosen; its turn opens and shows its executors. */
  selected: string | null;
  onSelect: (head: string) => void;
  formatTime: (value: string) => string;
  formatDateTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: TurnTimelineLabels;
  /** Search occurrences per segment head while searching, else null. */
  matches?: ReadonlyMap<string, number> | null;
  className?: string;
}

/** Leading characters of a subagent id, enough to tell them apart. */
const shortId = (id: string) => id.slice(0, 12);

/** How far a subagent's dot sits right of the main lane. */
const lanePx = 14;
/** Room either side of the main lane. */
const edgePx = 12;
/** How far the gutter sits in from the rows' left edge. */
const gutterInsetPx = 6;
/** A turn row's dot sits this far below the row's top: its padding and half a line. */
const turnDotYPx = 15;

/** A dot's key: a turn's own, or one of its executors'. */
const turnKey = (turn: number) => `t${turn}`;
const executorKey = (turn: number, executor: number) => `e${turn}.${executor}`;

/**
 * The session's turns, one row each, with each turn's executors under it: the
 * main line first, then its subagents, each with its side requests folded
 * under a count; a turn that is only a main line has none under it. A line
 * beside the rows carries the context from turn to turn; a turn without a
 * base starts afresh. While the session is searched, each row shows its
 * matches, and the ones without any fade.
 */
export function TurnTimeline({
  turns,
  segmentOf,
  selected,
  onSelect,
  formatTime,
  formatDateTime,
  formatNumber,
  labels,
  matches = null,
  className,
}: TurnTimelineProps) {
  const place = selected === null ? null : turnPlace(turns, selected);
  const position = place?.turn ?? 0;

  const boxRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLOListElement>(null);
  const selectedRef = React.useRef<HTMLButtonElement>(null);
  const edges = React.useMemo(() => turnEdges(turns), [turns]);
  // Rows start right of the gutter, so the lines never run under them.
  const gutter = edgePx * 2 + gutterInsetPx * 2;

  // Rows wrap their labels and side requests unfold, so the dots are placed
  // where the rows ended up.
  const [dots, setDots] = React.useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const measure = () => {
      const top = list.getBoundingClientRect().top;
      const next = new Map<string, number>();
      for (const node of list.querySelectorAll<HTMLElement>("[data-dot]")) {
        const rect = node.getBoundingClientRect();
        const y =
          node.dataset.dot?.startsWith("t") === true
            ? rect.top - top + turnDotYPx
            : rect.top - top + rect.height / 2;
        next.set(node.dataset.dot ?? "", y);
      }
      setDots((current) =>
        current.size === next.size &&
        [...next].every(([key, y]) => current.get(key) === y)
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
  }, [turns]);

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
    const next = turns[position + step];
    const head = next === undefined ? undefined : turnHead(next);
    if (head !== undefined) {
      onSelect(head);
    }
    event.preventDefault();
  };

  const count = (heads: readonly string[], exchanges: number) =>
    matches === null
      ? labels.segmentExchanges(formatNumber(exchanges))
      : labels.segmentMatches(
          formatNumber(
            heads.reduce((sum, head) => sum + (matches.get(head) ?? 0), 0),
          ),
        );
  const missed = (heads: readonly string[]) =>
    matches !== null && !heads.some((head) => matches.has(head));

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
      <ol ref={listRef} className="relative space-y-0.5">
        {turns.map((turn, index) => {
          const open = place !== null && place.turn === index;
          const heads = turn.executors.flatMap((executor) => [
            ...executor.main,
            ...executor.side,
          ]);
          const head = turnHead(turn);
          // A turn that is only a main line shows no executor row under it.
          const mainOnly = onlyMainLine(turn);
          return (
            <li key={turn.turn_id ?? `none-${index}`} data-turn={turn.turn}>
              {turn.new_context && index > 0 ? (
                <div
                  data-new-context
                  className="text-muted-foreground flex items-center gap-2 px-2 py-1 text-[11px]"
                >
                  <span className="bg-border h-px flex-1" />
                  {labels.newContext}
                  <span className="bg-border h-px flex-1" />
                </div>
              ) : null}
              <button
                ref={open && mainOnly ? selectedRef : undefined}
                type="button"
                role="option"
                data-dot={turnKey(index)}
                aria-selected={open}
                onClick={() => head !== undefined && onSelect(head)}
                className={cn(rowClass(open), missed(heads) && "opacity-45")}
                style={{
                  marginLeft: gutter,
                  width: `calc(100% - ${gutter}px)`,
                }}
              >
                <span className="flex items-baseline gap-2 text-xs">
                  <span className="text-foreground font-medium">
                    {turnName(labels, formatNumber, turn.turn)}
                  </span>
                  <span
                    className="text-muted-foreground"
                    title={formatDateTime(turn.start)}
                  >
                    {formatTime(turn.start)}
                  </span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
                    {count(heads, turn.exchange_count)}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 line-clamp-2 text-sm break-words",
                    turn.label === null && "text-muted-foreground italic",
                  )}
                >
                  {turn.label?.text ?? labels.noUserInput}
                </span>
              </button>
              {!mainOnly && turn.executors.length > 0 ? (
                <ul
                  className="mb-1 space-y-0.5"
                  style={{ paddingLeft: gutter + lanePx }}
                >
                  {turn.executors.map((executor, at) => (
                    <ExecutorRow
                      key={executor.subagent_id ?? "main"}
                      dot={executorKey(index, at)}
                      executor={executor}
                      chosen={
                        open && place.executor === at
                          ? (place.side ?? "main")
                          : null
                      }
                      selectedRef={selectedRef}
                      segmentOf={segmentOf}
                      onSelect={onSelect}
                      count={count}
                      missed={missed}
                      formatTime={formatTime}
                      formatNumber={formatNumber}
                      labels={labels}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
        <Gutter
          turns={turns}
          edges={edges}
          dots={dots}
          selected={
            place === null ? null : executorKey(place.turn, place.executor)
          }
        />
      </ol>
    </div>
  );
}

/** Whether a turn has only a main line: no subagent and no side requests. */
const onlyMainLine = (turn: SessionTurn) =>
  turn.executors.length === 1 &&
  turn.executors[0]?.subagent_id === null &&
  turn.executors[0].side.length === 0;

/** The context coming into a turn from the turn right before. */
interface TurnEdge {
  from: number;
  to: number;
}

/** The lines between turns: into each turn with a base, from the one before. */
function turnEdges(turns: readonly SessionTurn[]): TurnEdge[] {
  return turns.flatMap((turn, to) =>
    to > 0 && !turn.new_context ? [{ from: to - 1, to }] : [],
  );
}

/** Color of the turns' dots. */
const mainColor = "var(--chart-1)";
/** Color of the main lane, lighter than its dots. */
const laneColor = "color-mix(in oklab, var(--chart-1) 45%, var(--card))";
/** Color of the spine and bends to a turn's subagents. */
const subColor =
  "color-mix(in oklab, var(--muted-foreground) 45%, var(--card))";
/** How far above its dot a subagent's bend leaves the spine. */
const bendPx = 10;
/** Radius of a subagent's dot. */
const subDotPx = 3;

/**
 * The lines and dots beside the rows. The main lane runs through every turn
 * and down to its main line; a turn's subagents come off a thin spine of
 * their own. The turn shown has a filled dot.
 */
function Gutter({
  turns,
  edges,
  dots,
  selected,
}: {
  turns: readonly SessionTurn[];
  edges: readonly TurnEdge[];
  /** Height of each dot, by key. */
  dots: ReadonlyMap<string, number>;
  /** Key of the executor shown. */
  selected: string | null;
}) {
  if (dots.size === 0) {
    return null;
  }
  const x0 = edgePx;
  const xSub = edgePx + lanePx;
  /** The lowest dot on a turn's main lane: its main line's, else its own. */
  const bottomOf = (index: number) => {
    const main = turns[index]?.executors.findIndex(
      (executor) => executor.subagent_id === null,
    );
    return (
      (main === undefined || main < 0
        ? undefined
        : dots.get(executorKey(index, main))) ?? dots.get(turnKey(index))
    );
  };
  const height = Math.max(0, ...dots.values()) + 24;
  // A subagent shown has a halo on its dot; the main line is marked by its
  // row alone.
  const selectedTurn =
    selected === null ? null : Number(selected.slice(1).split(".")[0]);
  const selectedSub =
    selectedTurn !== null &&
    turns[selectedTurn]?.executors[Number(selected?.split(".")[1])]
      ?.subagent_id != null;
  const selectedY =
    selected === null || !selectedSub ? undefined : dots.get(selected);
  return (
    <svg
      aria-hidden
      width={edgePx * 2 + lanePx}
      height={height}
      className="pointer-events-none absolute top-0 z-[1] overflow-visible"
      style={{ left: gutterInsetPx }}
    >
      {edges.map(({ from, to }) => {
        const y1 = bottomOf(from);
        const y2 = dots.get(turnKey(to));
        if (y1 === undefined || y2 === undefined) {
          return null;
        }
        return (
          <path
            key={`${from}-${to}`}
            data-edge={`${from}-${to}`}
            d={`M ${x0} ${y1} L ${x0} ${y2}`}
            fill="none"
            stroke={laneColor}
            strokeWidth={1.5}
          />
        );
      })}
      {turns.map((turn, index) => {
        const top = dots.get(turnKey(index));
        if (top === undefined) {
          return null;
        }
        // The subagents hang off one thin spine down from the turn's dot,
        // each by a short bend into its own dot.
        const subs = turn.executors.flatMap((executor, at) => {
          const y = dots.get(executorKey(index, at));
          return executor.subagent_id === null || y === undefined ? [] : [y];
        });
        const lastSub = subs.length === 0 ? undefined : Math.max(...subs);
        // Below the main line's row, where the main lane does not run.
        const spineTop = Math.max(top, bottomOf(index) ?? top);
        return (
          <React.Fragment key={index}>
            {lastSub !== undefined && lastSub - bendPx > spineTop ? (
              <path
                d={`M ${x0} ${spineTop} L ${x0} ${lastSub - bendPx}`}
                fill="none"
                stroke={subColor}
                strokeWidth={1.5}
              />
            ) : null}
            {turn.executors.map((executor, at) => {
              const y = dots.get(executorKey(index, at));
              if (y === undefined) {
                return null;
              }
              return executor.subagent_id === null ? (
                <path
                  key={at}
                  d={`M ${x0} ${top} L ${x0} ${y}`}
                  fill="none"
                  stroke={laneColor}
                  strokeWidth={1.5}
                />
              ) : (
                <path
                  key={at}
                  data-derivation={executor.subagent_id}
                  d={`M ${x0} ${Math.max(top, y - bendPx)} Q ${x0} ${y}, ${xSub - subDotPx} ${y}`}
                  fill="none"
                  stroke={subColor}
                  strokeWidth={1.5}
                />
              );
            })}
          </React.Fragment>
        );
      })}
      {selectedY !== undefined ? (
        <circle
          cx={xSub}
          cy={selectedY}
          r={7.5}
          fill="var(--ring)"
          fillOpacity={0.2}
        />
      ) : null}
      {turns.map((turn, index) => {
        const y = dots.get(turnKey(index));
        if (y === undefined) {
          return null;
        }
        const shown = index === selectedTurn;
        return (
          <React.Fragment key={index}>
            <circle
              data-turn-dot={turn.turn ?? "none"}
              data-shown={shown || undefined}
              cx={x0}
              cy={y}
              r={3.5}
              fill={shown ? mainColor : "var(--card)"}
              stroke={mainColor}
              strokeWidth={1.5}
            />
            {turn.executors.map((executor, at) => {
              // The main line's row needs no dot: the main lane runs past it.
              const dot = dots.get(executorKey(index, at));
              if (dot === undefined || executor.subagent_id === null) {
                return null;
              }
              return (
                <circle
                  key={at}
                  cx={xSub}
                  cy={dot}
                  r={subDotPx}
                  fill="var(--card)"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                />
              );
            })}
          </React.Fragment>
        );
      })}
    </svg>
  );
}

/** One executor of a turn, and its side requests when unfolded. */
function ExecutorRow({
  dot,
  executor,
  chosen,
  selectedRef,
  segmentOf,
  onSelect,
  count,
  missed,
  formatTime,
  formatNumber,
  labels,
}: {
  /** Key of the executor's dot in the gutter. */
  dot: string;
  executor: TurnExecutor;
  /** `main` when its main line is shown, a side head when that is, else null. */
  chosen: string | null;
  /** Given to the row shown, to bring it into view. */
  selectedRef: React.RefObject<HTMLButtonElement | null>;
  segmentOf: ReadonlyMap<string, StreamSegment>;
  onSelect: (head: string) => void;
  count: (heads: readonly string[], exchanges: number) => string;
  missed: (heads: readonly string[]) => boolean;
  formatTime: (value: string) => string;
  formatNumber: (value: number) => string;
  labels: TurnTimelineLabels;
}) {
  const sideChosen = chosen !== null && chosen !== "main";
  const [unfolded, setUnfolded] = React.useState(sideChosen);
  React.useEffect(() => {
    if (sideChosen) {
      setUnfolded(true);
    }
  }, [sideChosen]);
  const head = executorHead(executor);
  const mainExchanges = executor.main.reduce(
    (sum, item) => sum + (segmentOf.get(item)?.exchange_count ?? 0),
    0,
  );
  return (
    <li data-executor={executor.subagent_id ?? "main"}>
      <button
        ref={chosen === "main" ? selectedRef : undefined}
        data-dot={dot}
        type="button"
        aria-current={chosen === "main" || undefined}
        onClick={() => head !== undefined && onSelect(head)}
        className={cn(
          subRowClass(chosen === "main"),
          missed(executor.main) && "opacity-45",
        )}
      >
        <span className="truncate">
          {executor.subagent_id === null ? (
            labels.mainLine
          ) : (
            <>
              {labels.subagent}
              {" · "}
              <span className="font-mono" title={executor.subagent_id}>
                {shortId(executor.subagent_id)}
              </span>
            </>
          )}
        </span>
        <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
          {count(executor.main, mainExchanges)}
        </span>
      </button>
      {executor.side.length > 0 ? (
        <>
          <button
            type="button"
            data-side-toggle
            aria-expanded={unfolded}
            onClick={() => setUnfolded((value) => !value)}
            className={cn(
              "text-muted-foreground hover:text-foreground w-full px-2 py-0.5 pl-4 text-left text-[11px]",
              missed(executor.side) && "opacity-45",
            )}
          >
            {unfolded ? "▾ " : "▸ "}
            {labels.sideRequests(formatNumber(executor.side.length))}
          </button>
          {unfolded ? (
            <ul className="ml-4 space-y-0.5">
              {executor.side.map((side) => {
                const segment = segmentOf.get(side);
                return (
                  <li key={side}>
                    <button
                      ref={chosen === side ? selectedRef : undefined}
                      type="button"
                      data-side={side}
                      aria-current={chosen === side || undefined}
                      onClick={() => onSelect(side)}
                      className={cn(
                        subRowClass(chosen === side),
                        missed([side]) && "opacity-45",
                      )}
                    >
                      <span className="text-muted-foreground shrink-0">
                        {segment ? formatTime(segment.start) : ""}
                      </span>
                      <span
                        className={cn(
                          "truncate",
                          !segment?.label && "text-muted-foreground italic",
                        )}
                      >
                        {segment?.label?.text ?? labels.noUserInput}
                      </span>
                      <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
                        {count([side], segment?.exchange_count ?? 0)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

function rowClass(selected: boolean): string {
  return cn(
    "relative block w-full rounded-lg px-2 py-2 text-left transition-colors",
    selected ? "bg-ring/10" : "hover:bg-muted/70",
  );
}

function subRowClass(selected: boolean): string {
  return cn(
    "flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors",
    selected ? "bg-ring/15 text-foreground" : "hover:bg-muted/70",
  );
}
