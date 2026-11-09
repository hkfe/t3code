import type { ReplyContextRecord } from "@t3tools/contracts";
import {
  formatComposerContextReference,
  toKindScopedComposerContextId,
} from "@t3tools/shared/composerContextReferences";
import { describe, expect, it } from "vite-plus/test";

import { availableActions, messageText, osc52, quotedMessageId, type Message } from "./actions.ts";

const message = (fields: Record<string, unknown>) =>
  ({ id: "item", status: "completed", runId: null, ...fields }) as unknown as Message;

const reply = {
  version: 1,
  kind: "reply",
  contextId: toKindScopedComposerContextId("reply", "m1"),
  label: "Reply to T3 Code",
  messageId: "m1",
  role: "assistant",
  text: "the original",
} as unknown as ReplyContextRecord;

describe("message actions", () => {
  it("strips a reply quote from the text and offers the original", () => {
    const sent = message({
      type: "user_message",
      messageId: "m2",
      text: `${formatComposerContextReference(reply)}\n\nmy answer`,
      context: { version: 1, records: [reply] },
    });
    expect(messageText(sent)).toBe("my answer");
    expect(quotedMessageId(sent)).toBe("m1");
    expect(availableActions(sent)).toEqual(["reply", "copy", "original"]);
  });

  it("forks only a completed assistant response from a run", () => {
    const assistant = { type: "assistant_message", messageId: "m1", text: "done" };
    expect(availableActions(message(assistant))).toEqual(["reply", "copy"]);
    expect(availableActions(message({ ...assistant, runId: "run-1" }))).toEqual([
      "reply",
      "copy",
      "fork",
    ]);
    expect(
      availableActions(message({ ...assistant, runId: "run-1", status: "running", text: "" })),
    ).toEqual([]);
  });

  it("builds OSC 52, wraps it for tmux and refuses terminals that ignore it", () => {
    expect(osc52("hi", {}, true)).toBe("\x1b]52;c;aGk=\x07");
    expect(osc52("hi", { TMUX: "/tmp/tmux" }, true)).toBe("\x1bPtmux;\x1b\x1b]52;c;aGk=\x07\x1b\\");
    expect(osc52("hi", { TERM_PROGRAM: "Apple_Terminal" }, true)).toBeNull();
    expect(osc52("hi", {}, false)).toBeNull();
  });
});
