import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { parseCustomSnooze, threadMenuItems } from "./menu.ts";

const now = new Date("2026-11-09T12:00:00");

const thread = {
  pinnedAt: null,
  settledOverride: null,
  snoozedUntil: null,
  archivedAt: null,
  activeRunId: null,
} as unknown as OrchestrationV2ThreadShell;

const labelsOf = (items: ReturnType<typeof threadMenuItems>) =>
  Object.fromEntries(items.map((item) => [item.id, item]));

describe("threadMenuItems", () => {
  it("names the reverse action for each thread state", () => {
    const items = labelsOf(
      threadMenuItems(
        {
          ...thread,
          pinnedAt: DateTime.makeUnsafe(now),
          settledOverride: "settled",
          snoozedUntil: DateTime.makeUnsafe(now.getTime() + 60_000),
          archivedAt: DateTime.makeUnsafe(now),
        },
        { canOperate: true, hasLabels: false, now },
      ),
    );
    expect(items.pin?.label).toBe("Unpin thread");
    expect(items.settle?.label).toBe("Un-settle thread");
    expect(items.snooze?.label).toBe("Wake thread");
    expect(items.archive?.label).toBe("Unarchive thread");
    expect(items.labels).toBeUndefined();
  });

  it("disables archive while running and mutations without the operate scope", () => {
    const running = labelsOf(
      threadMenuItems({ ...thread, activeRunId: "run-1" } as OrchestrationV2ThreadShell, {
        canOperate: true,
        hasLabels: true,
        now,
      }),
    );
    expect(running.archive?.disabled).toBe(true);
    const readOnly = threadMenuItems(thread, { canOperate: false, hasLabels: true, now });
    expect(readOnly.filter((item) => !item.disabled).map((item) => item.id)).toEqual([
      "mark-unread",
      "copy-link",
      "copy-id",
    ]);
  });
});

describe("parseCustomSnooze", () => {
  it("reads durations and local date times, and rejects the past and junk", () => {
    expect(parseCustomSnooze("90m", now)).toBe(new Date(now.getTime() + 90 * 60_000).toISOString());
    expect(parseCustomSnooze("2H", now)).toBe(
      new Date(now.getTime() + 2 * 3_600_000).toISOString(),
    );
    expect(parseCustomSnooze("2026-11-10 09:30", now)).toBe(
      new Date("2026-11-10T09:30:00").toISOString(),
    );
    expect(parseCustomSnooze("2026-11-08 09:30", now)).toBeNull();
    expect(parseCustomSnooze("0h", now)).toBeNull();
    expect(parseCustomSnooze("tomorrow", now)).toBeNull();
  });
});
