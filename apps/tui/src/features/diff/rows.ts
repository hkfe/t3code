import type { DiffFile, DiffLine, LineKind } from "./patch.ts";

/** One side of a visual row: a slice `[from, to)` of a diff line, or an empty filler. */
export interface Side {
  readonly kind: LineKind | "empty";
  readonly line: DiffLine | null;
  readonly from: number;
  readonly to: number;
  /** Changed range of the whole line text, against its paired line. */
  readonly mark: readonly [number, number] | null;
  /** A wrapped continuation: no line numbers. */
  readonly cont: boolean;
}

export type Row =
  | { readonly type: "hunk"; readonly text: string }
  | { readonly type: "fold"; readonly count: number }
  | { readonly type: "line"; readonly left: Side; readonly right: Side | null };

export interface RowOptions {
  readonly split: boolean;
  /** Cells for code text per side; wrapping cuts at it. */
  readonly textWidth: number;
  readonly wrap: boolean;
  /** Show every context line instead of folding long unchanged runs. */
  readonly expanded: boolean;
}

export interface DiffRows {
  readonly rows: ReadonlyArray<Row>;
  /** Row index of every hunk header, for n/p. */
  readonly hunkStarts: ReadonlyArray<number>;
}

const KEEP = 3;
const FOLD_MIN = KEEP * 2 + 2;
const EMPTY: Side = { kind: "empty", line: null, from: 0, to: 0, mark: null, cont: false };

/** Range that differs between two lines once their common prefix and suffix go. */
export function changedRange(a: string, b: string): [[number, number], [number, number]] | null {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++;
  // Nothing in common: the whole line already shows as changed.
  if (prefix + suffix === 0) return null;
  return [
    [prefix, a.length - suffix],
    [prefix, b.length - suffix],
  ];
}

type Pair = readonly [
  DiffLine | null,
  DiffLine | null,
  readonly [number, number] | null,
  readonly [number, number] | null,
];

/** Context lines pair with themselves; a run of removals pairs index-wise with the additions after it. */
function pairLines(lines: ReadonlyArray<DiffLine>): Pair[] {
  const pairs: Pair[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.kind === "context") {
      pairs.push([line, line, null, null]);
      index++;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (lines[index]?.kind === "del") dels.push(lines[index++]!);
    while (lines[index]?.kind === "add") adds.push(lines[index++]!);
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) {
      const del = dels[i] ?? null;
      const add = adds[i] ?? null;
      const range = del && add ? changedRange(del.text, add.text) : null;
      pairs.push([del, add, range?.[0] ?? null, range?.[1] ?? null]);
    }
  }
  return pairs;
}

function slices(line: DiffLine | null, mark: Side["mark"], options: RowOptions): Side[] {
  if (line === null) return [EMPTY];
  const length = line.text.length;
  const step = options.wrap ? Math.max(1, options.textWidth) : Math.max(1, length);
  const sides: Side[] = [];
  for (let from = 0; from < Math.max(1, length); from += step) {
    sides.push({
      kind: line.kind,
      line,
      from,
      to: Math.min(length, from + step),
      mark,
      cont: from > 0,
    });
  }
  return sides;
}

function pushPair(rows: Row[], pair: Pair, options: RowOptions) {
  const [left, right, leftMark, rightMark] = pair;
  if (options.split) {
    const lefts = slices(left, leftMark, options);
    const rights = slices(right, rightMark, options);
    for (let i = 0; i < Math.max(lefts.length, rights.length); i++) {
      rows.push({ type: "line", left: lefts[i] ?? EMPTY, right: rights[i] ?? EMPTY });
    }
    return;
  }
  if (left !== null)
    for (const side of slices(left, leftMark, options))
      rows.push({ type: "line", left: side, right: null });
  if (right !== null && right !== left)
    for (const side of slices(right, rightMark, options))
      rows.push({ type: "line", left: side, right: null });
}

/**
 * Visual rows of a file: hunk headers, folded unchanged runs and code rows. Unified mode lists a
 * change block's removals before its additions; split mode puts them side by side.
 */
export function buildRows(file: DiffFile, options: RowOptions): DiffRows {
  const rows: Row[] = [];
  const hunkStarts: number[] = [];
  for (const hunk of file.hunks) {
    hunkStarts.push(rows.length);
    rows.push({ type: "hunk", text: hunk.header });
    const pairs = options.split ? pairLines(hunk.lines) : unifiedPairs(hunk.lines);
    let index = 0;
    while (index < pairs.length) {
      let end = index;
      while (end < pairs.length && pairs[end]![0]?.kind === "context") end++;
      const run = end - index;
      if (!options.expanded && run >= FOLD_MIN) {
        const head = index === 0 ? 0 : KEEP;
        const tail = end === pairs.length ? 0 : KEEP;
        for (let i = index; i < index + head; i++) pushPair(rows, pairs[i]!, options);
        rows.push({ type: "fold", count: run - head - tail });
        for (let i = end - tail; i < end; i++) pushPair(rows, pairs[i]!, options);
        index = end;
      } else if (run > 0) {
        for (let i = index; i < end; i++) pushPair(rows, pairs[i]!, options);
        index = end;
      } else {
        pushPair(rows, pairs[index]!, options);
        index++;
      }
    }
  }
  return { rows, hunkStarts };
}

/** Unified order: each removal block, then its additions, keeping the intra-line marks. */
function unifiedPairs(lines: ReadonlyArray<DiffLine>): Pair[] {
  const paired = pairLines(lines);
  const pairs: Pair[] = [];
  let block: Pair[] = [];
  const flush = () => {
    for (const [del, , mark] of block) if (del !== null) pairs.push([del, null, mark, null]);
    for (const [, add, , mark] of block) if (add !== null) pairs.push([null, add, null, mark]);
    block = [];
  };
  for (const pair of paired) {
    if (pair[0]?.kind === "context") {
      flush();
      pairs.push(pair);
    } else block.push(pair);
  }
  flush();
  return pairs;
}
