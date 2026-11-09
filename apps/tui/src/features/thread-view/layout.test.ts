import { describe, expect, it } from "vite-plus/test";

import type { Block } from "./blocks.ts";
import { span, type Line } from "./lines.ts";
import { layoutBlocks, railCells, visibleLines, type LineCache } from "./layout.ts";

const block = (id: string, kind: Block["kind"] = "single"): Block =>
  ({ kind, id, items: [{ id }] }) as unknown as Block;

describe("layoutBlocks", () => {
  it("reuses cached lines until the items, width or expansion change", () => {
    const cache: LineCache = new Map();
    let renders = 0;
    const render = (b: Block, width: number): Line[] => {
      renders++;
      return [[span(`${b.id}@${width}`)], [span("x")]];
    };
    const blocks = [block("a", "user"), block("b")];
    const first = layoutBlocks(blocks, 10, new Set(), cache, render);
    expect(first).toMatchObject({ starts: [0, 3], total: 5, turns: [0] });
    layoutBlocks(blocks, 10, new Set(), cache, render);
    expect(renders).toBe(2);
    layoutBlocks([blocks[0]!, block("b")], 10, new Set(["a"]), cache, render);
    expect(renders).toBe(4);
    layoutBlocks(blocks, 20, new Set(["a"]), cache, render);
    expect(renders).toBe(6);
  });
});

describe("visibleLines", () => {
  it("starts mid-block and puts one blank line between blocks", () => {
    const layout = layoutBlocks([block("a"), block("b")], 10, new Set(), new Map(), (b) => [
      [span(`${b.id}1`)],
      [span(`${b.id}2`)],
    ]);
    const rows = visibleLines(layout, 1, 3).map(({ line, block }) => [line[0]?.text ?? "", block]);
    expect(rows).toEqual([
      ["a2", 0],
      ["", -1],
      ["b1", 1],
    ]);
  });
});

describe("railCells", () => {
  it("marks the viewport band and one tick per turn row", () => {
    expect(railCells(100, 10, 50, [0, 55, 95])).toEqual([
      "tick",
      "track",
      "track",
      "track",
      "track",
      "bandTick",
      "track",
      "track",
      "track",
      "tick",
    ]);
  });

  it("thins ticks on long threads so they stay a row apart", () => {
    const turns = Array.from({ length: 100 }, (_, index) => index * 10);
    const cells = railCells(1000, 10, 990, turns);
    expect(cells.filter((cell) => cell === "tick" || cell === "bandTick")).toHaveLength(5);
  });
});
