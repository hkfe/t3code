import { describe, expect, it } from "vite-plus/test";
import { MessageId } from "@t3tools/contracts";
import { ATTACHMENT_ONLY_BOOTSTRAP_PROMPT } from "@t3tools/shared/composerContextReferences";

import {
  deriveTimelineMinimapItems,
  resolveTimelineMinimapPreview,
  resolveTimelineMinimapTickIndices,
} from "./timelineMinimapItems";

describe("deriveTimelineMinimapItems", () => {
  it.each(["", "Ultrathink:\n"])(
    "omits bootstrap text from the minimap label and tooltip (%j)",
    (prefix) => {
      const at = "2026-10-01T00:00:00Z";
      const items = deriveTimelineMinimapItems([
        {
          kind: "message",
          id: "image-only",
          createdAt: at,
          showAssistantMeta: false,
          showAssistantCopyButton: false,
          assistantCopyStreaming: false,
          message: {
            id: MessageId.make("image-only"),
            role: "user",
            text: prefix + ATTACHMENT_ONLY_BOOTSTRAP_PROMPT,
            runId: null,
            streaming: false,
            createdAt: at,
            updatedAt: at,
          },
        },
      ]);
      expect(items).toEqual([{ id: "image-only", rowIndex: 0, userText: "", assistantText: null }]);
      expect(resolveTimelineMinimapPreview(items[0]!)?.userText).toBeNull();
    },
  );
});

describe("resolveTimelineMinimapPreview", () => {
  it("previews a thread autolink as prose, not its URL", () => {
    const preview = resolveTimelineMinimapPreview({
      id: "turn-1",
      rowIndex: 0,
      userText: null,
      assistantText:
        "Started <t3-thread://v2/env-1/thread-1> and [Fix CI](t3-thread://v2/env-1/t2).",
    });
    expect(preview?.assistantText).toBe("Started a thread and Fix CI.");
  });
});

describe("resolveTimelineMinimapTickIndices", () => {
  it("keeps every turn when the rail fits them", () => {
    expect(resolveTimelineMinimapTickIndices(4, 10)).toEqual([0, 1, 2, 3]);
    expect(resolveTimelineMinimapTickIndices(1, 10)).toEqual([0]);
    expect(resolveTimelineMinimapTickIndices(0, 10)).toEqual([]);
  });

  it("thins a long thread to evenly spaced, distinct ticks that keep the first and last turn", () => {
    expect(resolveTimelineMinimapTickIndices(10, 4)).toEqual([0, 3, 6, 9]);
    const ticks = resolveTimelineMinimapTickIndices(161, 52);
    expect(ticks).toHaveLength(52);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(160);
    expect(new Set(ticks).size).toBe(52);
  });
});
