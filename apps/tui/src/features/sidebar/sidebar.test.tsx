import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type OrchestrationProjectShell,
} from "@t3tools/contracts";
import { RegistryContext } from "@effect/atom-react";
import { render } from "ink-testing-library";
import { AtomRegistry } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { KeyRouter } from "../../app/input.tsx";
import { serverEnvironment } from "../../state/settings.ts";
import { environmentThreadShells } from "../../state/threadShells.ts";
import { routeAtom } from "../../state/ui.ts";
import { projectsAtom, Sidebar } from "./Sidebar.tsx";
import {
  buildSidebarRows,
  isUnread,
  resolveWaitingReason,
  type SidebarRow,
} from "./sidebarModel.ts";

const environmentId = EnvironmentId.make("environment-1");
const NOW = "2026-06-01T12:00:00.000Z";

function thread(id: string, fields: Partial<EnvironmentThreadShell> = {}): EnvironmentThreadShell {
  return {
    environmentId,
    id: ThreadId.make(id),
    projectId: ProjectId.make("project-a"),
    title: id,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: ThreadId.make(id) },
    runtime: null,
    latestRun: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    interactionMode: "default",
    pendingBackgroundTasks: [],
    pullRequests: [],
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    latestUserMessageAt: null,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    unsettledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    pinOrderKey: null,
    activeOrderKey: null,
    ...fields,
  } as EnvironmentThreadShell;
}

function project(id: string, title: string): OrchestrationProjectShell {
  return {
    id: ProjectId.make(id),
    title,
    workspaceRoot: `/work/${id}`,
  } as OrchestrationProjectShell;
}

const running = { status: "running", activeRunId: null } as EnvironmentThreadShell["runtime"];
const idle = { status: "idle", activeRunId: null } as EnvironmentThreadShell["runtime"];

function rows(
  threads: EnvironmentThreadShell[],
  options: { toggled?: string[]; filter?: string } = {},
) {
  return buildSidebarRows({
    threads,
    projects: [
      { environmentId, projects: [project("project-a", "Alpha"), project("project-b", "Beta")] },
    ],
    delegatedUnderParent: new Set(),
    toggled: new Set(options.toggled),
    filter: options.filter ?? "",
    now: NOW,
  });
}

const outline = (list: ReadonlyArray<SidebarRow>) =>
  list.map((row) =>
    row.kind === "thread"
      ? `${row.nested ? "  " : ""}${row.thread.id}`
      : `${row.collapsed ? "+" : "-"}${row.title} ${row.count}`,
  );

describe("buildSidebarRows", () => {
  const threads = [
    thread("pinned", { pinnedAt: NOW, hasPendingApprovals: true }),
    thread("approval", { hasPendingApprovals: true }),
    thread("limited", { runtime: { status: "failed", lastErrorClass: "usage_limit" } as never }),
    thread("working", { runtime: running }),
    thread("waiting", { runtime: idle, pendingBackgroundTasks: [{ kind: "subagent" }] as never }),
    thread("recent-a"),
    thread("recent-b", { projectId: ProjectId.make("project-b") }),
    thread("snoozed", { snoozedUntil: "2026-06-02T00:00:00.000Z" }),
    thread("settled", { settledOverride: "settled" }),
    thread("archived", { archivedAt: NOW }),
    thread("subagent", {
      lineage: {
        parentThreadId: ThreadId.make("working"),
        relationshipToParent: "subagent",
        rootThreadId: ThreadId.make("working"),
      },
    }),
  ];

  it("splits threads into sections, folds Recent into projects and closes the shelves", () => {
    expect(outline(rows(threads))).toEqual([
      "-Pinned 1",
      "pinned",
      "-Needs you 2",
      "approval",
      "limited",
      "-Working 1",
      "working",
      "-Waiting 1",
      "waiting",
      "-Recent 2",
      "-Alpha 1",
      "  recent-a",
      "-Beta 1",
      "  recent-b",
      "+Snoozed 1",
      "+Settled 1",
    ]);
  });

  it("toggles shelves and project folders by row key", () => {
    const alpha =
      rows(threads).find((row) => row.kind === "project" && row.title === "Alpha")?.key ?? "";
    const toggled = rows(threads, { toggled: ["section:snoozed", alpha] });
    expect(outline(toggled).slice(-6)).toEqual([
      "+Alpha 1",
      "-Beta 1",
      "  recent-b",
      "-Snoozed 1",
      "snoozed",
      "+Settled 1",
    ]);
  });

  it("lists only ranked matches while filtering", () => {
    expect(outline(rows(threads, { filter: "settled" }))).toEqual(["settled"]);
  });
});

describe("resolveWaitingReason", () => {
  it("names the threads a run waits on, then watched CI", () => {
    expect(
      resolveWaitingReason(
        thread("t", { runtime: running, blockedOnThreadWait: true, threadWaitCount: 2 }),
      ),
    ).toBe("2 threads");
    const ci = [{ watch: {}, snapshot: { checksState: "pending" } }] as never;
    expect(resolveWaitingReason(thread("t", { runtime: idle, pullRequests: ci }))).toBe("CI");
    expect(resolveWaitingReason(thread("t", { runtime: idle }))).toBeNull();
  });
});

describe("isUnread", () => {
  const completed = { latestRun: { completedAt: "2026-06-01T11:00:00.000Z" } as never };
  it("marks finished runs and failures after the last visit", () => {
    expect(
      isUnread(thread("t", { ...completed, lastVisitedAt: "2026-06-01T10:30:00.000Z" }), "ready"),
    ).toBe(true);
    expect(
      isUnread(thread("t", { ...completed, lastVisitedAt: "2026-06-01T11:30:00.000Z" }), "ready"),
    ).toBe(false);
    expect(isUnread(thread("t", completed), "ready")).toBe(false);
    expect(isUnread(thread("t", completed), "failed")).toBe(true);
  });
});

describe("Sidebar", () => {
  it("filters as you type, folds sections and opens the selected thread", async () => {
    const keep = { skipInitialRun: true };
    const registry = AtomRegistry.make({
      initialValues: [
        [
          environmentThreadShells.quietThreadShellsAtom,
          [thread("alpha"), thread("beta", { tags: ["bug"] })],
          keep,
        ],
        [environmentThreadShells.delegatedUnderParentAtom, new Set(), keep],
        [projectsAtom, [{ environmentId, projects: [project("project-a", "Alpha")] }], keep],
        [
          serverEnvironment.settingsValueAtom(environmentId),
          { threadLabels: [{ id: "bug", name: "bug", color: "red" }] },
          keep,
        ],
      ],
    });
    const screen = render(
      <RegistryContext.Provider value={registry}>
        <KeyRouter bindings={[]} commands={new Map()}>
          <Sidebar focused width={40} height={10} />
        </KeyRouter>
      </RegistryContext.Provider>,
    );
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toMatch(/beta +bug/));
      screen.stdin.write("h");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("▸ Recent 2"));
      expect(screen.lastFrame()).not.toContain("alpha");

      screen.stdin.write("/");
      screen.stdin.write("bet");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("/ bet"));
      expect(screen.lastFrame()).not.toContain("Recent");
      screen.stdin.write("\r");
      await vi.waitFor(() => expect(registry.get(routeAtom).thread?.threadId).toBe("beta"));
    } finally {
      screen.unmount();
    }
  });
});
