import { describe, expect, it } from "vite-plus/test";

import { terminalTabs } from "./model.ts";

describe("terminalTabs", () => {
  it.each([
    [["term-1", "term-2"], undefined, false, ["term-1", "term-2"], "term-1"],
    [["term-1"], "term-3", false, ["term-1", "term-3"], "term-3"],
    [["term-1"], null, true, ["term-1"], null],
    [[], undefined, true, ["term-1"], "term-1"],
    [[], undefined, false, [], null],
    [[], null, true, [], null],
  ] as const)("%j picked %j autoStart %j", (ids, picked, autoStart, tabs, selected) => {
    expect(terminalTabs(ids, picked, autoStart)).toEqual({ tabs, selected });
  });
});
