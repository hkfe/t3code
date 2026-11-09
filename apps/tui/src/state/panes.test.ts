import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  closePane,
  focusNextPane,
  MAX_PANES,
  openToSide,
  paneRoutes,
  splitPane,
  swapPane,
  threadInView,
  type Workspace,
} from "./panes.ts";

const ref = (id: string): ScopedThreadRef => ({
  environmentId: "env" as EnvironmentId,
  threadId: id as ThreadId,
});
const route = (id: string) => ({ view: "thread", thread: ref(id) });
const single: Workspace = { panes: { routes: [], active: 0, direction: "row" }, route: route("a") };
const ids = (workspace: Workspace) => paneRoutes(workspace).map((r) => r.thread?.threadId);

describe("panes", () => {
  it("splits, focuses, swaps and closes while routeAtom stays the active pane", () => {
    const split = splitPane(single, "column");
    expect(split.panes).toMatchObject({ active: 1, direction: "column" });
    expect(ids(split)).toEqual(["a", "a"]);

    // The sidebar opens "b" in the active pane by setting the route only.
    const opened = { ...split, route: route("b") };
    expect(ids(opened)).toEqual(["a", "b"]);

    const focused = focusNextPane(opened);
    expect(focused.route.thread?.threadId).toBe("a");
    expect(ids(focused)).toEqual(["a", "b"]);

    const swapped = swapPane(focused);
    expect(ids(swapped)).toEqual(["b", "a"]);
    expect(swapped.panes.active).toBe(1);

    const closed = closePane(swapped);
    expect(ids(closed)).toEqual(["b"]);
    expect(closed.route.thread?.threadId).toBe("b");
    expect(closePane(closed)).toBe(closed);
  });

  it("opens to the side without moving focus, and reuses the next pane when full", () => {
    let workspace = openToSide(single, ref("b"));
    expect(ids(workspace)).toEqual(["a", "b"]);
    expect(workspace.route.thread?.threadId).toBe("a");
    // Notifications skip a thread shown in any pane, not only the focused one.
    expect(threadInView(workspace, ref("b"))).toBe(true);
    expect(threadInView(workspace, ref("c"))).toBe(false);

    workspace = openToSide(openToSide(workspace, ref("c")), ref("d"));
    expect(ids(workspace)).toEqual(["a", "d", "c", "b"]);
    expect(splitPane(workspace, "row")).toBe(workspace);

    workspace = openToSide(workspace, ref("e"));
    expect(ids(workspace)).toEqual(["a", "e", "c", "b"]);
    expect(paneRoutes(workspace)).toHaveLength(MAX_PANES);
  });
});
