import { describe, expect, it } from "vite-plus/test";

import { FIXTURE_PATCH } from "./fixtures.ts";
import { parsePatch } from "./patch.ts";

describe("parsePatch", () => {
  it("reads change types, counts and line numbers", () => {
    const files = parsePatch(FIXTURE_PATCH);
    expect(
      files.map((file) => [file.path, file.change, file.additions, file.deletions, file.binary]),
    ).toEqual([
      ["src/app.ts", "modified", 1, 2, false],
      ["README.md", "added", 2, 0, false],
      ["old.txt", "deleted", 0, 1, false],
      ["src/lib/after.ts", "renamed", 0, 0, false],
      ["logo.png", "modified", 0, 0, true],
    ]);
    expect(files[3]!.oldPath).toBe("src/lib/before.ts");
    const [first, second] = files[0]!.hunks;
    expect(first!.lines.map((line) => [line.kind, line.oldNo, line.newNo])).toEqual([
      ["context", 1, 1],
      ["del", 2, null],
      ["add", null, 2],
      ["context", 3, 3],
      ["context", 4, 4],
    ]);
    // Inside a hunk, "--- x" is a removed line, not a file header.
    expect(second!.lines.map((line) => [line.kind, line.text, line.oldNo])).toEqual([
      ["context", "keep();", 20],
      ["del", "-- removed sql comment", 21],
      ["context", "end();", 22],
    ]);
  });
});
