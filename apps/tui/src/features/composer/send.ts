import {
  deriveThreadTitleSeed,
  type StartThreadTurnInput,
} from "@t3tools/client-runtime/operations";
import { resolveComposerDispatchMode } from "@t3tools/client-runtime/state/composer-dispatch";
import {
  COMPOSER_CONTEXT_REPLY_TEXT_MAX_CHARS,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  type CommandId,
  type MessageId,
  type ProjectId,
  type ReplyContextRecord,
  type ServerProvider,
} from "@t3tools/contracts";
import {
  ATTACHMENT_ONLY_BOOTSTRAP_PROMPT,
  formatComposerContextReference,
  replaceComposerContextReferences,
  sanitizeComposerContextLabel,
  toKindScopedComposerContextId,
} from "@t3tools/shared/composerContextReferences";

import type { ComposerReplyTarget } from "../../state/composer.ts";
import type { TurnThread } from "./settings.ts";
import type { ComposerDraft } from "./state.ts";

const TRUNCATION_MARKER = "\n… truncated …";

export function replyAuthor(role: ReplyContextRecord["role"]): string {
  return role === "assistant" ? "T3 Code" : "You";
}

/** Same record as web's replyContextRecord: chips become labels, a nested reply is dropped. */
function replyContextRecord(target: ComposerReplyTarget): ReplyContextRecord {
  const text = replaceComposerContextReferences(target.text, (reference) =>
    reference.kind === "reply" ? "" : reference.label,
  ).trim();
  const max = COMPOSER_CONTEXT_REPLY_TEXT_MAX_CHARS;
  return {
    version: 1,
    kind: "reply",
    contextId: toKindScopedComposerContextId("reply", target.messageId),
    label: sanitizeComposerContextLabel(`Reply to ${replyAuthor(target.role)}`, "reply"),
    messageId: target.messageId,
    role: target.role,
    text:
      text.length <= max
        ? text
        : `${text.slice(0, max - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`,
  };
}

/** A sent prompt for history recall: the reply quote dropped, other chips kept. */
export function promptFromMessage(text: string): string {
  return replaceComposerContextReferences(text, (reference) =>
    reference.kind === "reply" ? "" : reference.source,
  ).trim();
}

export function threadIsRunning(thread: TurnThread): boolean {
  return thread.activeRunId !== null;
}

/** A thread only this client knows yet; the first send creates it, in a new worktree if chosen. */
export interface NewThreadSend {
  readonly projectId: ProjectId;
  readonly worktree: { readonly projectCwd: string; readonly baseBranch: string } | null;
}

/** Null when there is nothing to send. */
export function buildTurnInput(input: {
  readonly thread: TurnThread;
  readonly newThread?: NewThreadSend;
  readonly draft: ComposerDraft;
  readonly reply: ComposerReplyTarget | null;
  readonly provider: ServerProvider | undefined;
  /** The other active-turn action: queue instead of steer. */
  readonly alternate: boolean;
  readonly messageId: MessageId;
  readonly commandId: CommandId;
  readonly createdAt: string;
}): { readonly input: StartThreadTurnInput; readonly sentReply: boolean } | null {
  const { thread, draft } = input;
  const text = draft.editor.text.trim();
  if (text.length === 0 && draft.attachments.length === 0) return null;
  // As on web: a reply quotes into new turns only, and needs text the quote can lead.
  const reply = text.length > 0 && input.reply !== null ? replyContextRecord(input.reply) : null;
  const setupRunning =
    thread.activityRunStatus === "preparing" || thread.activityRunStatus === "starting";
  const interactionMode =
    input.provider?.showInteractionModeToggle === false
      ? DEFAULT_PROVIDER_INTERACTION_MODE
      : (draft.interactionMode ?? thread.interactionMode);
  const modelSelection = draft.modelSelection ?? thread.modelSelection;
  const runtimeMode = draft.runtimeMode ?? thread.runtimeMode;
  const titleSeed = deriveThreadTitleSeed({ text, attachments: draft.attachments });
  const { newThread } = input;
  return {
    sentReply: reply !== null,
    input: {
      commandId: input.commandId,
      createdAt: input.createdAt,
      threadId: thread.id,
      message: {
        messageId: input.messageId,
        role: "user",
        text: reply
          ? `${formatComposerContextReference(reply)}\n\n${text}`
          : text || ATTACHMENT_ONLY_BOOTSTRAP_PROMPT,
        attachments: draft.attachments,
        ...(reply ? { context: { version: 1, records: [reply] } } : {}),
      },
      modelSelection,
      titleSeed,
      runtimeMode,
      interactionMode,
      dispatchMode: resolveComposerDispatchMode({
        running: threadIsRunning(thread),
        alternateModifier: input.alternate,
        canSteer: !setupRunning,
      }),
      // As web's first send of a draft thread.
      ...(newThread && {
        bootstrap: {
          createThread: {
            projectId: newThread.projectId,
            title: titleSeed,
            modelSelection,
            runtimeMode,
            interactionMode,
            branch: null,
            worktreePath: null,
            createdAt: input.createdAt,
          },
          ...(newThread.worktree && {
            prepareWorktree: newThread.worktree,
            runSetupScript: true,
          }),
        },
      }),
    },
  };
}
