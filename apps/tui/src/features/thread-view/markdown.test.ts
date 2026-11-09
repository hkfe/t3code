import { describe, expect, it } from "vite-plus/test";

import { theme } from "../../theme/theme.ts";
import { highlight } from "./highlight.ts";
import { lineWidth, type Line } from "./lines.ts";
import { parseMarkdown, renderMarkdown } from "./markdown.ts";

const text = (lines: ReadonlyArray<Line>) =>
  lines.map((line) => line.map((part) => part.text).join(""));
const render = (markdown: string, width: number) => renderMarkdown(parseMarkdown(markdown), width);

describe("renderMarkdown", () => {
  it("wraps list items under their marker and never exceeds the width", () => {
    const lines = render("- one two three four five six\n- b\n  1. nested item", 14);
    expect(text(lines)).toEqual([
      "• one two",
      "  three four",
      "  five six",
      "• b",
      "  1. nested",
      "     item",
    ]);
    expect(lines.every((line) => lineWidth(line) <= 14)).toBe(true);
  });

  it("splits words wider than the line", () => {
    expect(text(render("abcdefghijkl", 8))).toEqual(["abcdefgh", "ijkl"]);
  });

  it("counts tabs and wide characters in cells, so no line overflows", () => {
    const lines = render("```\n\tif (x) {\n\t\treturn 1;\n```\n\n漢字かな交じり文の段落です", 10);
    expect(text(lines).some((line) => line.includes("\t"))).toBe(false);
    expect(lines.every((line) => lineWidth(line) <= 10)).toBe(true);
  });

  it("draws a table that fits as a grid and degrades a wide one to header: value rows", () => {
    const table = "| a | bb |\n|---|---:|\n| 1 | 2 |";
    expect(text(render(table, 40))).toEqual(["a │ bb", "──┼───", "1 │  2"]);
    const wide = "| name | description |\n|---|---|\n| x | a long cell |\n| y | z |";
    expect(text(render(wide, 12))).toEqual([
      "name: x",
      "description:",
      "  a long",
      "  cell",
      "────────────",
      "name: y",
      "description:",
      "  z",
    ]);
  });

  it("keeps link targets and styles inline code", () => {
    const [line] = render("see [docs](https://x.dev) and `code`", 80);
    expect(text([line!])).toEqual(["see docs (https://x.dev) and code"]);
    expect(line!.find((part) => part.text === "code")?.color).toBe(theme.syntax.strings);
  });
});

describe("highlight", () => {
  it("colors code by role and keeps multi-line comments on their lines", () => {
    const lines = highlight('const x = call("s"); /* a\nb */ 42', "ts");
    const color = (word: string) => lines.flat().find((part) => part.text.includes(word))?.color;
    expect(color("const")).toBe(theme.syntax.keywords);
    expect(color("call")).toBe(theme.syntax.functions);
    expect(color('"s"')).toBe(theme.syntax.strings);
    expect(color("/* a")).toBe(theme.syntax.comments);
    expect(color("b */")).toBe(theme.syntax.comments);
    expect(color("42")).toBe(theme.syntax.numbersBooleans);
    expect(text(lines)).toEqual(['const x = call("s"); /* a', "b */ 42"]);
  });

  it("uses # comments for shell", () => {
    expect(highlight("ls # list", "sh")[0]!.at(-1)).toMatchObject({
      text: "# list",
      color: theme.syntax.comments,
    });
  });
});
