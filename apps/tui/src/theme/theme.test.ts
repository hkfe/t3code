import stringWidth from "string-width";
import { describe, expect, it } from "vite-plus/test";

import { parseBackgroundReply } from "./background.ts";
import { foldAscii, stripColor } from "./output.ts";
import { detectBackground, detectColorMode, detectUnicode } from "./theme.ts";

describe("theme detection", () => {
  it.each([
    [{ NO_COLOR: "1", COLORTERM: "truecolor" }, "none"],
    [{ FORCE_COLOR: "1", COLORTERM: "truecolor" }, "ansi16"],
    [{ COLORTERM: "truecolor" }, "rich"],
    [{ TERM: "xterm-256color" }, "rich"],
    [{ TERM: "screen-256color" }, "rich"],
    [{ TERM: "xterm", TERM_PROGRAM: "Apple_Terminal" }, "rich"],
    [{ TERM: "xterm" }, "ansi16"],
    [{ TERM: "linux" }, "ansi16"],
  ] as const)("color mode of %o is %s", (env, mode) => {
    expect(detectColorMode(env)).toBe(mode);
  });

  it("reads the background from T3_TUI_THEME, then COLORFGBG", () => {
    expect(detectBackground({})).toBe("dark");
    expect(detectBackground({ COLORFGBG: "0;15" })).toBe("light");
    expect(detectBackground({ COLORFGBG: "15;default;0" })).toBe("dark");
    expect(detectBackground({ COLORFGBG: "0;15", T3_TUI_THEME: "dark" })).toBe("dark");
    expect(parseBackgroundReply("\u001b]11;rgb:ffff/fdfd/f8f8\u001b\\\u001b[?62;22c")).toBe(
      "light",
    );
    expect(parseBackgroundReply("\u001b]11;rgb:1c/19/17\u0007")).toBe("dark");
    expect(parseBackgroundReply("\u001b[?62;22c")).toBeNull();
  });

  it("uses unicode only with a UTF-8 locale", () => {
    expect(detectUnicode({ LANG: "en_US.UTF-8" })).toBe(true);
    expect(detectUnicode({ LANG: "C" })).toBe(false);
    expect(detectUnicode({ LANG: "en_US.UTF-8", T3_TUI_ASCII: "1" })).toBe(false);
  });
});

describe("output folding", () => {
  it("folds to ASCII without changing the cell width", () => {
    const line = "╭─ Threads ─╮ ● Ready · ✓ 漢字 🚀 …";
    const folded = foldAscii(line);
    expect(folded).toMatch(/^[\u0000-\u007f]*$/);
    expect(stringWidth(folded)).toBe(stringWidth(line));
    expect(foldAscii("\u001b[38;2;1;2;3m│x│\u001b[39m")).toBe("\u001b[38;2;1;2;3m|x|\u001b[39m");
  });

  it("drops colors and shows backgrounds as reverse video", () => {
    expect(stripColor("\u001b[38;2;1;2;3mA\u001b[39m")).toBe("A");
    expect(stripColor("\u001b[1;38;5;208mB\u001b[22;39m")).toBe("\u001b[1mB\u001b[22m");
    expect(stripColor("\u001b[48;2;46;41;37mC\u001b[49m")).toBe("\u001b[7mC\u001b[27m");
    expect(stripColor("\u001b[100mD\u001b[0m")).toBe("\u001b[7mD\u001b[0m");
  });
});
