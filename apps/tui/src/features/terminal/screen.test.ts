import xterm from "@xterm/headless";
import type { Key } from "ink";
import { describe, expect, it } from "vite-plus/test";

import { theme } from "../../theme/theme.ts";
import { keyBytes, screenRows } from "./screen.ts";

const press = (input: string, key: Partial<Key> = {}) => ({ input, key: key as Key });

describe("keyBytes", () => {
  it.each([
    ["a", {}, "a"],
    ["c", { ctrl: true }, "\x03"],
    ["\\", { ctrl: true }, "\x1c"],
    [" ", { ctrl: true }, "\x00"],
    ["b", { meta: true }, "\x1bb"],
    ["", { return: true }, "\r"],
    ["", { tab: true, shift: true }, "\x1b[Z"],
    ["", { backspace: true }, "\x7f"],
    ["", { escape: true }, "\x1b"],
    ["", { upArrow: true }, "\x1b[A"],
    ["", { rightArrow: true, ctrl: true }, "\x1b[1;5C"],
    ["", { pageUp: true }, "\x1b[5~"],
    ["", { delete: true }, "\x1b[3~"],
  ] as const)("%j %j", (input, key, bytes) => {
    expect(keyBytes(press(input, key), false)).toBe(bytes);
  });

  it("sends SS3 arrows in application cursor mode", () => {
    expect(keyBytes(press("", { leftArrow: true }), true)).toBe("\x1bOD");
  });
});

describe("screenRows", () => {
  const write = (term: xterm.Terminal, data: string) =>
    new Promise<void>((resolve) => term.write(data, resolve));

  it("groups styled cells, maps palette colors to the theme and inverts the cursor", async () => {
    const term = new xterm.Terminal({ cols: 12, rows: 2, allowProposedApi: true });
    await write(term, "ok \x1b[31mred\x1b[0m\r\n\x1b[1mbold");
    expect(screenRows(term, 0, 2, 12, { line: 1, column: 4 })).toEqual([
      [{ text: "ok " }, { text: "red", color: theme.danger }],
      [
        { text: "bold", bold: true },
        { text: " ", inverse: true },
      ],
    ]);
    term.dispose();
  });

  it("shows only the visible text of OSC 8 links and OSC 52 clipboard writes", async () => {
    const term = new xterm.Terminal({ cols: 12, rows: 1, allowProposedApi: true });
    await write(
      term,
      "\x1b]8;;https://x\x07link\x1b]8;;\x07 \x1b]52;c;ZXZpbA==\x07\x9d52;c;eA==\x07ok",
    );
    expect(screenRows(term, 0, 1, 12, null)).toEqual([
      [{ text: "link", underline: true }, { text: " ok" }],
    ]);
    term.dispose();
  });

  it("cuts rows to the width without splitting a wide character", async () => {
    const term = new xterm.Terminal({ cols: 8, rows: 1, allowProposedApi: true });
    await write(term, "ab漢字");
    expect(screenRows(term, 0, 1, 5, null)).toEqual([[{ text: "ab漢" }]]);
    term.dispose();
  });
});
