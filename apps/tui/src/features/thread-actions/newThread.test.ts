import { EnvironmentId, ProjectId, type OrchestrationProjectShell } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { newThreadTargets } from "./newThread.ts";

const environmentId = EnvironmentId.make("environment-1");

function project(
  id: string,
  extra: Partial<OrchestrationProjectShell> = {},
): OrchestrationProjectShell {
  return {
    id: ProjectId.make(id),
    title: id,
    workspaceRoot: `/work/${id}`,
    ...extra,
  } as OrchestrationProjectShell;
}

describe("newThreadTargets", () => {
  it("puts No project first, then pinned projects, and leaves out archived and scratch projects", () => {
    const targets = newThreadTargets([
      {
        environmentId,
        label: "Mac",
        scratchWorkspaceRoot: "/work/scratch",
        canOperate: true,
        projects: [
          project("beta", { defaultThreadEnvMode: "worktree" }),
          project("alpha"),
          project("pinned", { pinnedAt: "2026-01-01T00:00:00.000Z" }),
          project("old", { archivedAt: "2026-01-01T00:00:00.000Z" }),
          project("scratch"),
        ],
      },
    ]);
    expect(targets.map((target) => [target.label, target.defaultEnvMode])).toEqual([
      ["No project", "local"],
      ["pinned", "local"],
      ["alpha", "local"],
      ["beta", "worktree"],
    ]);
  });
});
