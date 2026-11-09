import type { Block } from "./blocks.ts";
import type { Line } from "./lines.ts";

interface Cached {
  readonly items: Block["items"];
  readonly width: number;
  readonly expanded: boolean;
  readonly lines: ReadonlyArray<Line>;
}

export type LineCache = Map<string, Cached>;

export interface Layout {
  readonly blocks: ReadonlyArray<Block>;
  readonly lines: ReadonlyArray<ReadonlyArray<Line>>;
  /** First line of each block; blocks are separated by one blank line. */
  readonly starts: ReadonlyArray<number>;
  readonly total: number;
  /** First line of each user turn, for the rail. */
  readonly turns: ReadonlyArray<number>;
}

const sameItems = (a: Block["items"], b: Block["items"]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/** Wraps every block, reusing cached lines while a block's items, width and expansion hold. */
export function layoutBlocks(
  blocks: ReadonlyArray<Block>,
  width: number,
  expanded: ReadonlySet<string>,
  cache: LineCache,
  render: (block: Block, width: number, expanded: boolean) => Line[],
): Layout {
  const lines: Array<ReadonlyArray<Line>> = [];
  const starts: number[] = [];
  const turns: number[] = [];
  let total = 0;
  for (const block of blocks) {
    const isExpanded = expanded.has(block.id);
    let cached = cache.get(block.id);
    if (
      !cached ||
      cached.width !== width ||
      cached.expanded !== isExpanded ||
      !sameItems(cached.items, block.items)
    ) {
      cached = {
        items: block.items,
        width,
        expanded: isExpanded,
        lines: render(block, width, isExpanded),
      };
      cache.set(block.id, cached);
    }
    if (starts.length > 0) total += 1;
    starts.push(total);
    if (block.kind === "user") turns.push(total);
    lines.push(cached.lines);
    total += cached.lines.length;
  }
  return { blocks, lines, starts, total, turns };
}

/** Index of the block holding `line` (or the gap after it). */
export function blockAt(layout: Layout, line: number): number {
  let low = 0;
  let high = layout.starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (layout.starts[mid]! <= line) low = mid;
    else high = mid - 1;
  }
  return low;
}

export interface VisibleLine {
  readonly line: Line;
  /** -1 for the blank line between blocks. */
  readonly block: number;
}

/** The `height` lines from `top`, walking only the blocks on screen. */
export function visibleLines(layout: Layout, top: number, height: number): VisibleLine[] {
  const out: VisibleLine[] = [];
  if (layout.blocks.length === 0) return out;
  for (let block = blockAt(layout, top); block < layout.blocks.length; block++) {
    const start = layout.starts[block]!;
    const lines = layout.lines[block]!;
    for (let index = Math.max(0, top - start); index < lines.length; index++) {
      if (out.length >= height) return out;
      out.push({ line: lines[index]!, block });
    }
    if (block < layout.blocks.length - 1 && out.length < height) out.push({ line: [], block: -1 });
  }
  return out;
}

export type RailCell = "track" | "band" | "tick" | "bandTick";

/**
 * The scroll rail: one cell per row, a band where the viewport is, a tick per user turn.
 * Long threads keep every n-th turn, so ticks stay at least one row apart.
 */
export function railCells(
  total: number,
  height: number,
  top: number,
  turns: ReadonlyArray<number>,
): RailCell[] {
  const scale = Math.max(total, 1) / height;
  const step = Math.max(1, Math.ceil(turns.length / Math.max(1, Math.floor(height / 2))));
  const ticks = new Set(
    turns.filter((_, index) => index % step === 0).map((line) => Math.floor(line / scale)),
  );
  return Array.from({ length: height }, (_, row) => {
    const from = row * scale;
    const to = (row + 1) * scale;
    const band = to > top && from < top + height;
    const tick = ticks.has(row);
    return band ? (tick ? "bandTick" : "band") : tick ? "tick" : "track";
  });
}
