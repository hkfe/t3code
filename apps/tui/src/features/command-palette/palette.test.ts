import { describe, expect, it } from "vite-plus/test";

import type { PaletteItem } from "../../app/feature.ts";
import { addRecentPick, rankPalette, type PaletteGroup } from "./palette.ts";

const item = (id: string, title: string, detail?: string): PaletteItem => ({
  id,
  title,
  ...(detail ? { detail } : {}),
  run: () => {},
});

const groups: ReadonlyArray<PaletteGroup> = [
  {
    source: { id: "commands", label: "Command" },
    items: [item("sidebar.toggle", "Toggle sidebar"), item("app.quit", "Quit")],
  },
  {
    source: { id: "threads", label: "Thread" },
    items: [item("t1", "Sidebar polish"), item("t2", "Fix login")],
  },
  {
    source: { id: "messages", label: "Message", search: true },
    items: [item("m1", "Fix login", "the sidebar flickers on resize")],
  },
];

describe("rankPalette", () => {
  it("lists every filtered row without a query, recent picks first", () => {
    const rows = rankPalette(groups, "", ["threads:t2"]);
    expect(rows.map((row) => row.key)).toEqual([
      "threads:t2",
      "commands:sidebar.toggle",
      "commands:app.quit",
      "threads:t1",
    ]);
  });

  it("filters and highlights by the query, recent picks first among equal matches", () => {
    const rows = rankPalette(groups, "sidebar", ["threads:t1"]);
    expect(rows.map((row) => row.key)).toEqual([
      "threads:t1",
      "commands:sidebar.toggle",
      "messages:m1",
    ]);
    expect(rows[0]?.titleRanges).toEqual([{ start: 0, end: 7 }]);
    expect(rows[2]?.detailRanges).toEqual([{ start: 4, end: 11 }]);
  });
});

describe("addRecentPick", () => {
  it("moves a repeated pick to the front", () => {
    expect(addRecentPick(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });
});
