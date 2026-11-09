import * as NodeOS from "node:os";
import { describe, expect, it } from "vite-plus/test";

import { pastedImagePath } from "./attachments.ts";

describe("pastedImagePath", () => {
  it.each([
    ["/tmp/shot.png", "/tmp/shot.png"],
    ["  '/tmp/my shot.JPG'  ", "/tmp/my shot.JPG"],
    ["/tmp/my\\ shot.webp", "/tmp/my shot.webp"],
    ["file:///tmp/a%20b.gif", "/tmp/a b.gif"],
    ["~/a.png", `${NodeOS.homedir()}/a.png`],
    ["relative/a.png", null],
    ["/tmp/notes.txt", null],
    ["/tmp/a.png\n/tmp/b.png", null],
  ])("%j -> %j", (pasted, expected) => {
    expect(pastedImagePath(pasted)).toBe(expected);
  });
});
