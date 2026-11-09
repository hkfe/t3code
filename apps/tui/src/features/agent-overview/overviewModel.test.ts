import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildOverview, columnsFor, gridRows, moveSelection } from "./overviewModel.ts";

const NOW = "2026-06-01T12:00:00.000Z";

function thread(id: string, fields: Partial<EnvironmentThreadShell> = {}): EnvironmentThreadShell {
  return {
    environmentId: EnvironmentId.make("environment-1"),
    id: ThreadId.make(id),
    projectId: ProjectId.make("project-a"),
    title: id,
    runtime: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    updatedAt: "2026-06-01T10:00:00.000Z",
    archivedAt: null,
    deletedAt: null,
    settledAt: null,
    snoozedUntil: null,
    ...fields,
  } as EnvironmentThreadShell;
}

const at = (minute: number) => `2026-06-01T10:${String(minute).padStart(2, "0")}:00.000Z`;
const ids = (sections: ReturnType<typeof buildOverview>) =>
  sections.map((section) => [section.group, section.entries.map((entry) => entry.thread.id)]);

describe("buildOverview", () => {
  it("groups needs, working and recent newest first and leaves quiet threads out", () => {
    const sections = buildOverview(
      [
        thread("old-recent", { updatedAt: at(1) }),
        thread("approval", { hasPendingApprovals: true, updatedAt: at(2) }),
        thread("failed", {
          runtime: { status: "failed" } as EnvironmentThreadShell["runtime"],
          updatedAt: at(3),
        }),
        thread("running", {
          runtime: { status: "running" } as EnvironmentThreadShell["runtime"],
          updatedAt: at(4),
        }),
        thread("new-recent", { updatedAt: at(5) }),
        thread("archived", { archivedAt: at(6) }),
        thread("deleted", { deletedAt: at(6) }),
        thread("settled", { settledAt: at(6) }),
        thread("snoozed", { snoozedUntil: "2026-06-02T00:00:00.000Z" }),
        thread("snooze-over", { snoozedUntil: at(0), updatedAt: at(0) }),
      ],
      NOW,
    );
    expect(ids(sections)).toEqual([
      ["needs", ["failed", "approval"]],
      ["working", ["running"]],
      ["recent", ["new-recent", "old-recent", "snooze-over"]],
    ]);
  });

  it("keeps the 8 newest recent threads and drops empty groups", () => {
    const threads = Array.from({ length: 10 }, (_, i) => thread(`t${i}`, { updatedAt: at(i) }));
    expect(ids(buildOverview(threads, NOW))).toEqual([
      ["recent", ["t9", "t8", "t7", "t6", "t5", "t4", "t3", "t2"]],
    ]);
  });
});

describe("grid", () => {
  // Needs 3, working 1, recent 5 in 2 columns: [0,1] [2] [3] [4,5] [6,7] [8].
  const sections = buildOverview(
    [
      ...[0, 1, 2].map((i) => thread(`n${i}`, { hasPendingUserInput: true })),
      thread("w", { runtime: { status: "running" } as EnvironmentThreadShell["runtime"] }),
      ...[0, 1, 2, 3, 4].map((i) => thread(`r${i}`)),
    ],
    NOW,
  );
  const rows = gridRows(sections, 2);

  it("starts each section on a new row", () => {
    expect(rows).toEqual([[0, 1], [2], [3], [4, 5], [6, 7], [8]]);
  });

  it("moves up and down by column, clamped to short rows and the edges", () => {
    expect(moveSelection(rows, 1, "down")).toBe(2);
    expect(moveSelection(rows, 3, "down")).toBe(4);
    expect(moveSelection(rows, 5, "up")).toBe(3);
    expect(moveSelection(rows, 7, "down")).toBe(8);
    expect(moveSelection(rows, 8, "down")).toBe(8);
    expect(moveSelection(rows, 0, "up")).toBe(0);
  });

  it("moves left and right through the flat list without wrapping", () => {
    expect(moveSelection(rows, 1, "right")).toBe(2);
    expect(moveSelection(rows, 8, "right")).toBe(8);
    expect(moveSelection(rows, 0, "left")).toBe(0);
    expect(moveSelection([], 0, "down")).toBe(0);
  });

  it("fits 1 to 4 columns to the width", () => {
    expect([20, 60, 90, 200].map(columnsFor)).toEqual([1, 2, 3, 4]);
  });
});
