import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { lastMessagePreview, moveInGrid, switcherThreads } from "./switcherModel.ts";

const environmentId = EnvironmentId.make("environment-1");
const NOW = "2026-06-01T12:00:00.000Z";

const thread = (id: string, fields: Partial<EnvironmentThreadShell> = {}) =>
  ({
    environmentId,
    id: ThreadId.make(id),
    updatedAt: "2026-06-01T10:00:00.000Z",
    latestUserMessageAt: null,
    archivedAt: null,
    snoozedUntil: null,
    ...fields,
  }) as EnvironmentThreadShell;

const ids = (threads: ReadonlyArray<EnvironmentThreadShell>) => threads.map((t) => t.id);

describe("switcherThreads", () => {
  const old = thread("old");
  const recent = thread("recent", { latestUserMessageAt: "2026-06-01T11:00:00.000Z" });
  const updated = thread("updated", { updatedAt: "2026-06-01T10:30:00.000Z" });
  const snoozed = thread("snoozed", {
    updatedAt: "2026-06-01T11:59:00.000Z",
    snoozedUntil: "2026-06-02T00:00:00.000Z",
  });
  const archived = thread("archived", { archivedAt: "2026-06-01T11:00:00.000Z" });
  const all = [old, snoozed, updated, archived, recent];

  it("sorts by last activity and leaves out snoozed and archived threads", () => {
    expect(ids(switcherThreads(all, null, NOW))).toEqual(["recent", "updated", "old"]);
  });

  it("puts the open thread first, even when snoozed", () => {
    const current = { environmentId, threadId: ThreadId.make("snoozed") };
    expect(ids(switcherThreads(all, current, NOW))).toEqual([
      "snoozed",
      "recent",
      "updated",
      "old",
    ]);
  });
});

describe("moveInGrid", () => {
  it.each([
    [4, "left", 3],
    [4, "right", 5],
    [4, "up", 1],
    [4, "down", 7],
    [0, "left", 0],
    [1, "up", 1],
    [5, "down", 7],
    [6, "down", 6],
    [7, "right", 7],
  ] as const)("from %i %s goes to %i in 8 cards of 3 columns", (from, key, to) => {
    expect(moveInGrid(from, 8, 3, key)).toBe(to);
  });
});

describe("lastMessagePreview", () => {
  it("names the author of the last message with text, as plain text", () => {
    expect(
      lastMessagePreview([
        { item: { type: "user_message", text: "Fix **the** bug" } },
        { item: { type: "assistant_message", text: "Done: see [docs](http://x) and `code`" } },
        { item: { type: "assistant_message", text: "  " } },
        { item: { type: "tool_call" } },
      ]),
    ).toEqual({ author: "Agent", text: "Done: see docs and code" });
    expect(lastMessagePreview([{ item: { type: "user_message", text: "# Hi\n- a" } }])).toEqual({
      author: "You",
      text: "Hi a",
    });
    expect(lastMessagePreview([])).toBeNull();
  });
});
