import type { OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { buildBlocks, renderBlock, workSummary } from "./blocks.ts";

const at = DateTime.makeUnsafe("2026-06-20T00:00:00.000Z");
const row = (id: string, fields: Record<string, unknown>) =>
  ({
    item: {
      id,
      status: "completed",
      title: null,
      startedAt: at,
      updatedAt: at,
      completedAt: at,
      ...fields,
    },
  }) as unknown as OrchestrationV2ProjectedTurnItem;
const command = (id: string) => row(id, { type: "command_execution", input: "ls", exitCode: 0 });

describe("buildBlocks", () => {
  it("groups consecutive work between messages and summarizes it like the web", () => {
    const blocks = buildBlocks([
      row("u", { type: "user_message", messageId: "m1", text: "hi", attachments: [] }),
      row("r", { type: "reasoning", text: "**Plan**", streaming: false }),
      command("c1"),
      command("c2"),
      row("a", { type: "assistant_message", messageId: "m2", text: "done", streaming: false }),
      command("c3"),
    ]);
    expect(blocks.map((block) => [block.kind, block.id, block.items.length])).toEqual([
      ["user", "u", 1],
      ["work", "r", 3],
      ["assistant", "a", 1],
      ["work", "c3", 1],
    ]);
    expect(workSummary(blocks[1]!.items).summary).toBe("Ran 2 commands");
    const collapsed = renderBlock(blocks[1]!, 40, false);
    expect(collapsed).toHaveLength(1);
    expect(renderBlock(blocks[1]!, 40, true).length).toBeGreaterThan(3);
  });
});
