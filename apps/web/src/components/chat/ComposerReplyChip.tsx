import type { ReplyContextRecord } from "@t3tools/contracts";
import { ReplyIcon, XIcon } from "lucide-react";
import { replyContextAuthor } from "~/lib/composerContextRecords";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function ComposerReplyChip(props: { reply: ReplyContextRecord; onRemove: () => void }) {
  const author = replyContextAuthor(props.reply.role);
  return (
    <div
      role="group"
      aria-label={`Replying to ${author}`}
      className="mb-3 flex min-w-0 items-start gap-2 rounded-md border-s-2 border-border bg-muted/40 py-1.5 ps-2 pe-1 text-xs"
    >
      <ReplyIcon aria-hidden className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-muted-foreground">Replying to {author}</div>
        <div className="line-clamp-2 whitespace-pre-wrap wrap-break-word text-muted-foreground">
          {props.reply.text}
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon-xs"
              variant="ghost-muted"
              aria-label="Remove reply"
              onClick={props.onRemove}
            />
          }
        >
          <XIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="top">Remove reply</TooltipPopup>
      </Tooltip>
    </div>
  );
}
