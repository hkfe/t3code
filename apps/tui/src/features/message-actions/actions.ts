import { ReplyContextRecord, type OrchestrationV2TurnItem } from "@t3tools/contracts";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import * as Schema from "effect/Schema";

export type Message = Extract<
  OrchestrationV2TurnItem,
  { readonly type: "user_message" | "assistant_message" }
>;

export type MessageAction = "reply" | "copy" | "fork" | "original";

export const ACTION_KEYS: ReadonlyArray<{ readonly key: string; readonly action: MessageAction }> =
  [
    { key: "r", action: "reply" },
    { key: "y", action: "copy" },
    { key: "f", action: "fork" },
    { key: "o", action: "original" },
  ];

export function isMessage(item: OrchestrationV2TurnItem): item is Message {
  return item.type === "user_message" || item.type === "assistant_message";
}

const isReplyRecord = Schema.is(ReplyContextRecord);

/** The text a reader sees: a user message drops its inline reply quote. */
export function messageText(message: Message): string {
  if (message.type === "assistant_message") return message.text;
  return replaceComposerContextReferences(message.text, (reference) =>
    reference.kind === "reply" ? "" : reference.source,
  ).trim();
}

/** The message a sent user message quotes, if it is a reply. */
export function quotedMessageId(message: Message): string | null {
  if (message.type !== "user_message") return null;
  return message.context?.records.find(isReplyRecord)?.messageId ?? null;
}

/** As web: a completed assistant response from a run can be forked; the server checks the rest. */
function canFork(message: Message): boolean {
  return (
    message.type === "assistant_message" && message.status === "completed" && message.runId !== null
  );
}

export function availableActions(message: Message): ReadonlyArray<MessageAction> {
  const hasText = messageText(message).length > 0;
  return ACTION_KEYS.map(({ action }) => action).filter((action) => {
    if (action === "reply" || action === "copy") return hasText;
    if (action === "fork") return canFork(message);
    return quotedMessageId(message) !== null;
  });
}

/**
 * The OSC 52 escape that sets the terminal clipboard, also over SSH; tmux needs it wrapped.
 * Null when the terminal is known to ignore it, so the caller can say so.
 */
export function osc52(
  text: string,
  env: Readonly<Record<string, string | undefined>>,
  isTTY: boolean,
): string | null {
  if (!isTTY || env.TERM_PROGRAM === "Apple_Terminal" || env.TERM === "linux") return null;
  const sequence = `\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`;
  return env.TMUX ? `\x1bPtmux;\x1b${sequence}\x1b\\` : sequence;
}
