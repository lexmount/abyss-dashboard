import type { StreamSegment } from "@/api/usage";

/** How many lane colors the timeline cycles through. */
export const laneColorCount = 5;

/** A segment in its place on the timeline. */
export interface TimelineRow {
  segment: StreamSegment;
  /** Position of the segment in the session, from 0. */
  ordinal: number;
  /**
   * Lane of the segment. A continuation keeps its lane, and so does the
   * longest branch of a fork; every other branch takes a lane of its own.
   */
  lane: number;
  /**
   * Index into the lane colors. The longest branch of a fork keeps the
   * fork's color; every other branch gets one of its own.
   */
  color: number;
  /**
   * A side branch that ends in this one segment: a short spur off the line
   * it branched from, beside its own row, rather than a line from the fork.
   */
  spur: boolean;
  /** Branches off the fork point this segment ends in, or 0. */
  forks: number;
}

export interface StreamLayout {
  /** Segments in session order. */
  rows: TimelineRow[];
  /** Lanes the timeline uses. */
  lanes: number;
  /** Position of each segment, by its head. */
  ordinalOf: Map<string, number>;
}

/**
 * Places a session's segments on the timeline, in session order, each in a
 * lane.
 *
 * Streams do not tell the branches of a fork apart: each one is a new
 * stream. The timeline only draws them differently, so that a long run reads
 * as one line. The branch with the most exchanges in its own subtree, or of
 * equal ones the one that ends last, goes straight on in the fork's lane and
 * color; the others bend out, each in a color of its own, and a side request
 * that ends in one segment is a short spur beside that line. While a session
 * is still going, its longest branch, and with it the colors, may change.
 */
export function streamLayout(segments: readonly StreamSegment[]): StreamLayout {
  const childrenOf = new Map<string, string[]>();
  const branchesOff = new Map<string, number>();
  for (const segment of segments) {
    if (segment.parent !== null) {
      pushTo(childrenOf, segment.parent, segment.head);
    }
    if (segment.kind === "branch" && segment.forked_from !== null) {
      branchesOff.set(
        segment.forked_from,
        (branchesOff.get(segment.forked_from) ?? 0) + 1,
      );
    }
  }
  // A fork point is the base of more than one branch; its segment ends there.
  const forks = new Map<string, number>();
  for (const segment of segments) {
    const count = branchesOff.get(segment.forked_from ?? "") ?? 0;
    if (segment.kind === "branch" && segment.parent !== null && count > 1) {
      forks.set(segment.parent, count);
    }
  }
  const subtrees = subtreeSizes(segments, childrenOf);

  const state: LaneState = {
    used: new Set(),
    reserved: new Map(),
    release: [],
    spurs: new Map(),
    spursDue: new Map(),
    ended: new Set(),
  };
  const colorOf = new Map<string, number>();
  let nextColor = 0;
  let lanes = 0;
  const rows = segments.map((segment, ordinal): TimelineRow => {
    // A segment nothing continues gives its lane back once the next one starts.
    for (const lane of state.release) {
      state.used.delete(lane);
    }
    state.release = [];
    const reserved = state.reserved.get(segment.head);
    state.reserved.delete(segment.head);
    // A spur takes a lane only at its own row; the line it comes off keeps
    // its lane until its last spur, so nothing else runs there in between.
    const spurOff = state.spurs.get(segment.head);
    state.spurs.delete(segment.head);
    if (spurOff !== undefined) {
      const due = (state.spursDue.get(spurOff) ?? 1) - 1;
      if (due > 0) {
        state.spursDue.set(spurOff, due);
      } else {
        state.spursDue.delete(spurOff);
        if (state.ended.delete(spurOff)) {
          state.release.push(spurOff);
        }
      }
    }
    const lane = reserved ?? takeLane(state.used);
    const color = colorOf.get(segment.head) ?? nextColor++;
    const children = childrenOf.get(segment.head) ?? [];
    if (children.length > 0) {
      // The longest branch goes on in the fork's lane and color, the others
      // bend out in colors other than the fork's.
      const heir = longestBranch(children, subtrees);
      state.reserved.set(heir, lane);
      colorOf.set(heir, color);
      for (const child of children) {
        if (child === heir) {
          continue;
        }
        if ((childrenOf.get(child) ?? []).length > 0) {
          state.reserved.set(child, takeLane(state.used));
        } else {
          state.spurs.set(child, lane);
          state.spursDue.set(lane, (state.spursDue.get(lane) ?? 0) + 1);
        }
        if (nextColor % laneColorCount === color % laneColorCount) {
          nextColor += 1;
        }
        colorOf.set(child, nextColor++);
      }
    } else if (state.spursDue.has(lane)) {
      state.ended.add(lane);
    } else {
      state.release.push(lane);
    }
    lanes = Math.max(lanes, lane + 1);
    return {
      segment,
      ordinal,
      lane,
      color,
      spur: spurOff !== undefined,
      forks: forks.get(segment.head) ?? 0,
    };
  });
  return {
    rows,
    lanes,
    ordinalOf: new Map(segments.map((segment, ordinal) => [segment.head, ordinal])),
  };
}

interface Subtree {
  /** Exchanges of the segment and of every segment continuing it, to the end. */
  exchanges: number;
  /** When the last of those segments ends, in milliseconds. */
  end: number;
}

/** The exchanges and the end of each segment's subtree, by the segment's head. */
function subtreeSizes(
  segments: readonly StreamSegment[],
  childrenOf: ReadonlyMap<string, string[]>,
): Map<string, Subtree> {
  const subtrees = new Map<string, Subtree>();
  // Children come after their parents, so walking backwards sums them first.
  for (let position = segments.length - 1; position >= 0; position -= 1) {
    const segment = segments[position];
    const subtree = { exchanges: segment.exchange_count, end: Date.parse(segment.end) };
    for (const child of childrenOf.get(segment.head) ?? []) {
      const below = subtrees.get(child);
      if (below) {
        subtree.exchanges += below.exchanges;
        subtree.end = Math.max(subtree.end, below.end);
      }
    }
    subtrees.set(segment.head, subtree);
  }
  return subtrees;
}

/**
 * The branch drawn as the line going on: the most exchanges in its subtree,
 * then the latest end, then the earliest start.
 */
function longestBranch(
  children: readonly string[],
  subtrees: ReadonlyMap<string, Subtree>,
): string {
  const empty = { exchanges: 0, end: -Infinity };
  let heir = children[0];
  let best = subtrees.get(heir) ?? empty;
  for (const child of children.slice(1)) {
    const subtree = subtrees.get(child) ?? empty;
    if (
      subtree.exchanges > best.exchanges ||
      (subtree.exchanges === best.exchanges && subtree.end > best.end)
    ) {
      heir = child;
      best = subtree;
    }
  }
  return heir;
}

interface LaneState {
  used: Set<number>;
  /** Lanes kept for segments that continue one already placed, by head. */
  reserved: Map<string, number>;
  /** Lanes to give back when the next segment starts. */
  release: number[];
  /** The lane each spur still to come branches off, by the spur's head. */
  spurs: Map<string, number>;
  /** Spurs still to come off each lane. */
  spursDue: Map<number, number>;
  /** Lanes whose line has ended, kept until their last spur comes. */
  ended: Set<number>;
}

function takeLane(used: Set<number>): number {
  let lane = 0;
  while (used.has(lane)) {
    lane += 1;
  }
  used.add(lane);
  return lane;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

/** The color of a lane, from the theme's chart colors. */
export function laneColor(color: number): string {
  return `var(--chart-${(color % laneColorCount) + 1})`;
}
