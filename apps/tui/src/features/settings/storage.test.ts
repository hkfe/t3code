import { describe, expect, it } from "vite-plus/test";

import { parseDays } from "./storage.ts";

describe("parseDays", () => {
  it("turns empty into off and rejects values the server refuses", () => {
    expect(parseDays(" ", 1)).toBeNull();
    expect(parseDays("14", 1)).toBe(14);
    expect(parseDays("0", 0)).toBe(0);
    expect(parseDays("0", 1)).toBeUndefined();
    expect(parseDays("3651", 1)).toBeUndefined();
    expect(parseDays("1.5", 1)).toBeUndefined();
  });
});
