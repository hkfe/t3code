import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { VcsStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildProjectRows, gitSummary, projectColor } from "./model.ts";

const project = (id: string, title: string, extra: Partial<EnvironmentProject> = {}) =>
  ({ environmentId: "env", id, title, workspaceRoot: `/w/${id}`, ...extra }) as EnvironmentProject;
const thread = (id: string, projectId: string, lineage: object = {}) =>
  ({ environmentId: "env", id, projectId, title: id, lineage }) as EnvironmentThreadShell;

describe("buildProjectRows", () => {
  it("puts pinned projects first, hides scratch and archived, counts listed threads", () => {
    const rows = buildProjectRows(
      [
        project("b", "Beta"),
        project("a", "Alpha"),
        project("p", "Zed", { pinnedAt: "2026-01-01T00:00:00.000Z" }),
        project("s", "Scratch", { isScratch: true }),
        project("x", "Old", { archivedAt: "2026-01-01T00:00:00.000Z" }),
      ],
      [
        thread("t1", "a"),
        thread("t2", "a"),
        thread("sub", "a", { relationshipToParent: "subagent" }),
      ],
      new Set(["env:a"]),
    );
    expect(
      rows.map((row) => (row.kind === "project" ? `${row.key}:${row.threadCount}` : row.key)),
    ).toEqual(["env:p:0", "env:a:2", "env:a:t1", "env:a:t2", "env:b:0"]);
  });
});

describe("gitSummary", () => {
  const status = {
    isRepo: true,
    refName: "feature/x",
    aheadCount: 1,
    behindCount: 2,
    workingTree: { files: [{}, {}, {}] },
    pr: { number: 12, state: "open" },
  } as unknown as VcsStatusResult;

  it("shows branch, ahead, behind, changed files and the open pull request", () => {
    expect(gitSummary(status, null)).toBe("feature/x ↑1 ↓2 ●3 #12");
    expect(gitSummary({ ...status, aheadCount: 0, pr: null }, null)).toBe("feature/x ↓2 ●3");
    expect(gitSummary(null, "main")).toBe("main");
    expect(gitSummary({ ...status, isRepo: false }, "main")).toBe("not a git repository");
  });
});

describe("projectColor", () => {
  it("uses the icon color, else the web hash of the title", () => {
    expect(
      projectColor({ title: "x", projectIcon: { kind: "monogram", text: "X", color: "rose" } }),
    ).toBe("rose");
    // Same seed loop as apps/web/src/projectIdentity.ts over the 18 contract colors.
    expect(projectColor({ title: "t3code" })).toBe(projectColor({ title: " T3CODE " }));
  });
});
