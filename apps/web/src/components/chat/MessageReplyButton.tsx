import type { LegendListRef } from "@legendapp/list/react";
import type { MessageId, ReplyContextRecord } from "@t3tools/contracts";
import { ReplyIcon } from "lucide-react";
import { use } from "react";
import { useComposerReplyStore } from "~/composerReplyStore";
import { replyContextRecord } from "~/lib/composerContextRecords";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";
import { TimelineRowCtx } from "./timelineRowContext";

export function MessageReplyButton(props: {
  message: { id: MessageId; role: ReplyContextRecord["role"]; text: string };
}) {
  const { routeThreadKey, canOperateThread } = use(TimelineRowCtx);
  if (!canOperateThread || props.message.text.trim().length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="ghost-muted"
            aria-label="Reply to message"
            onClick={() =>
              useComposerReplyStore
                .getState()
                .setReply(routeThreadKey, replyContextRecord(props.message))
            }
          />
        }
      >
        <ReplyIcon className="size-3" />
      </TooltipTrigger>
      <TooltipPopup side="top">Reply to message</TooltipPopup>
    </Tooltip>
  );
}

export function scrollTimelineToMessage(list: LegendListRef | null, messageId: MessageId) {
  if (!list) return;
  const rows: ReadonlyArray<MessagesTimelineRow> = list.getState().data;
  const index = rows.findIndex((row) => row.kind === "message" && row.message.id === messageId);
  if (index < 0) {
    toastManager.add({ type: "info", title: "The original message is not loaded." });
    return;
  }
  void list.scrollToIndex({
    index,
    animated: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    viewOffset: 24,
  });
}
