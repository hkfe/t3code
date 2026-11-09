import { EnvironmentId, ThreadId, type OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { newestFirst, type ThreadListRow } from "./threadList.ts";

const environmentId = EnvironmentId.make("environment-1");

function row(id: string, updatedAt: string, archived = false): ThreadListRow {
  const thread = {
    id: ThreadId.make(id),
    updatedAt: DateTime.makeUnsafe(updatedAt),
    archivedAt: archived ? DateTime.makeUnsafe(updatedAt) : null,
  } as OrchestrationV2ThreadShell;
  return { environmentId, thread };
}

describe("newestFirst", () => {
  it("orders by last update and leaves out archived threads", () => {
    const rows = newestFirst([
      row("old", "2026-01-01T00:00:00Z"),
      row("archived", "2026-03-01T00:00:00Z", true),
      row("new", "2026-02-01T00:00:00Z"),
    ]);
    expect(rows.map((entry) => entry.thread.id)).toEqual(["new", "old"]);
  });
});
