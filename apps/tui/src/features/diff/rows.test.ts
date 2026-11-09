import { describe, expect, it } from "vite-plus/test";

import { theme } from "../../theme/theme.ts";
import { changeBar, listRows } from "./fileList.ts";
import { FIXTURE_PATCH } from "./fixtures.ts";
import { paintSide } from "./paint.ts";
import { parsePatch, type DiffFile } from "./patch.ts";
import { buildRows, changedRange, type Row } from "./rows.ts";

const files = parsePatch(FIXTURE_PATCH);
const app = files[0]!;
const options = { split: false, textWidth: 80, wrap: false, expanded: false };

function describeRow(row: Row) {
  if (row.type !== "line") return row.type;
  const side = (cell: typeof row.left) =>
    `${cell.kind}:${cell.line?.text.slice(cell.from, cell.to) ?? ""}`;
  return row.right === null ? side(row.left) : `${side(row.left)} | ${side(row.right)}`;
}

describe("buildRows", () => {
  it("lists removals before additions in unified mode and pairs them side by side", () => {
    const unified = buildRows(app, options);
    expect(unified.rows.slice(0, 4).map(describeRow)).toEqual([
      "hunk",
      "context:import { a } from './a';",
      "del:const total = sum(1, 2);",
      "add:const total = sum(1, 2, 3);",
    ]);
    expect(unified.hunkStarts).toEqual([0, 6]);
    const split = buildRows(app, { ...options, split: true });
    expect(describeRow(split.rows[2]!)).toBe(
      "del:const total = sum(1, 2); | add:const total = sum(1, 2, 3);",
    );
    expect(describeRow(split.rows[7]!)).toBe("del:-- removed sql comment | empty:");
  });

  it("marks the changed words of a paired line", () => {
    expect(changedRange("sum(1, 2);", "sum(1, 2, 3);")).toEqual([
      [8, 8],
      [8, 11],
    ]);
    expect(changedRange("abc", "xyz")).toBeNull();
  });

  it("folds long unchanged runs until expanded, and wraps long lines", () => {
    const context = Array.from({ length: 12 }, (_, i) => ({
      kind: "context" as const,
      text: `line ${i}`,
      oldNo: i + 1,
      newNo: i + 1,
    }));
    const file: DiffFile = {
      ...app,
      hunks: [
        {
          header: "@@ -1,13 +1,13 @@",
          oldStart: 1,
          newStart: 1,
          lines: [...context, { kind: "add", text: "x".repeat(25), oldNo: null, newNo: 13 }],
        },
      ],
    };
    // The fold keeps 3 lines above the change; a hunk-leading run keeps none above.
    expect(buildRows(file, options).rows.map(describeRow)).toEqual([
      "hunk",
      "fold",
      "context:line 9",
      "context:line 10",
      "context:line 11",
      `add:${"x".repeat(25)}`,
    ]);
    expect(buildRows(file, { ...options, expanded: true }).rows).toHaveLength(14);
    const wrapped = buildRows(file, { ...options, wrap: true, textWidth: 10 }).rows.slice(-3);
    expect(
      wrapped.map((row) => row.type === "line" && [row.left.from, row.left.to, row.left.cont]),
    ).toEqual([
      [0, 10, false],
      [10, 20, true],
      [20, 25, true],
    ]);
  });
});

describe("paintSide", () => {
  it("puts the word background on the changed range and pads to the width", () => {
    const line = app.hunks[0]!.lines[2]!;
    const spans = paintSide(
      [{ text: line.text, color: "c" }],
      {
        kind: "add",
        line,
        from: 0,
        to: line.text.length,
        mark: [22, 25],
        cont: false,
      },
      30,
    );
    expect(spans).toEqual([
      { text: "const total = sum(1, 2", color: "c", backgroundColor: theme.diff.addedBg },
      { text: ", 3", color: "c", backgroundColor: theme.diff.addedWordBg },
      { text: ");", color: "c", backgroundColor: theme.diff.addedBg },
      { text: "   ", backgroundColor: theme.diff.addedBg },
    ]);
  });
});

describe("file list", () => {
  it("groups files under folder rows in tree mode, root files first", () => {
    expect(listRows(files, true).map((row) => (row.type === "dir" ? row.path : row.name))).toEqual([
      "logo.png",
      "old.txt",
      "README.md",
      "src/",
      "app.ts",
      "src/lib/",
      "after.ts",
    ]);
  });

  it("scales the change bar to the largest file", () => {
    expect(changeBar(app, 30)).toEqual({ add: 0, del: 1, rest: 4 });
    expect(changeBar({ ...app, additions: 20, deletions: 10 }, 30)).toEqual({
      add: 3,
      del: 2,
      rest: 0,
    });
  });
});
