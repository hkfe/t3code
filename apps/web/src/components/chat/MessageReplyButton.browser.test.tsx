import { MessageId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { useComposerReplyStore } from "~/composerReplyStore";
import "~/index.css";
import { render } from "../../../test/render";
import { ComposerReplyChip } from "./ComposerReplyChip";
import { MessageReplyButton } from "./MessageReplyButton";
import { TimelineRowCtx, type TimelineRowSharedState } from "./timelineRowContext";

const THREAD_KEY = "environment:thread";

function Harness() {
  const reply = useComposerReplyStore((store) => store.byThreadKey[THREAD_KEY] ?? null);
  return (
    <TimelineRowCtx
      value={{ routeThreadKey: THREAD_KEY, canOperateThread: true } as TimelineRowSharedState}
    >
      <MessageReplyButton
        message={{ id: MessageId.make("m1"), role: "assistant", text: "Use a lock.\nThen retry." }}
      />
      {reply ? (
        <ComposerReplyChip
          reply={reply}
          onRemove={() => useComposerReplyStore.getState().setReply(THREAD_KEY, null)}
        />
      ) : null}
    </TimelineRowCtx>
  );
}

describe("MessageReplyButton", () => {
  it("attaches the message as a removable reply chip from the keyboard", async () => {
    useComposerReplyStore.setState({ byThreadKey: {} });
    await using screen = await render(<Harness />);

    await userEvent.keyboard("{Tab}{Enter}");
    const chip = screen.getByRole("group", { name: "Replying to T3 Code" });
    await expect.element(chip.getByText(/Use a lock\./)).toBeVisible();
    expect(useComposerReplyStore.getState().byThreadKey[THREAD_KEY]).toMatchObject({
      kind: "reply",
      messageId: "m1",
      role: "assistant",
    });

    await userEvent.keyboard("{Tab}{Enter}");
    await expect.element(chip).not.toBeInTheDocument();
    expect(useComposerReplyStore.getState().byThreadKey).toEqual({});
  });
});
