import { describe, expect, it } from "vite-plus/test";

import { applyMove, cursorLine, insertText, moveLine, wrapLines } from "./editor.ts";

describe("editor", () => {
  it("jumps and deletes by word, and steps over a surrogate pair as one character", () => {
    const state = { text: "foo bar.baz 👍", cursor: 14 };
    expect(applyMove(state, "backspace")).toEqual({ text: "foo bar.baz ", cursor: 12 });
    expect(applyMove({ ...state, cursor: 11 }, "wordLeft").cursor).toBe(8);
    expect(applyMove({ ...state, cursor: 3 }, "wordRight").cursor).toBe(7);
    expect(applyMove({ ...state, cursor: 11 }, "deleteWordBack")).toEqual({
      text: "foo bar. 👍",
      cursor: 8,
    });
  });

  it("moves between lines keeping the column, and reports the first and last line", () => {
    const state = { text: "abcdef\nab\nabcd", cursor: 5 };
    expect(moveLine(state, 1)).toEqual({ ...state, cursor: 9 });
    expect(moveLine({ ...state, cursor: 9 }, 1)).toEqual({ ...state, cursor: 12 });
    expect(moveLine(state, -1)).toBeNull();
    expect(moveLine({ ...state, cursor: 12 }, 1)).toBeNull();
    expect(applyMove({ ...state, cursor: 9 }, "home").cursor).toBe(7);
    expect(applyMove({ ...state, cursor: 9 }, "deleteToLineStart").text).toBe("abcdef\n\nabcd");
  });

  it("normalizes pasted line endings and wraps long lines", () => {
    expect(insertText({ text: "ab", cursor: 1 }, "x\r\ny")).toEqual({ text: "ax\nyb", cursor: 4 });
    const lines = wrapLines("abcdefg\n\nhi", 3);
    expect(lines).toEqual([
      { text: "abc", start: 0 },
      { text: "def", start: 3 },
      { text: "g", start: 6 },
      { text: "", start: 8 },
      { text: "hi", start: 9 },
    ]);
    expect(cursorLine(lines, 7)).toBe(2);
    expect(cursorLine(lines, 10)).toBe(4);
  });
});
