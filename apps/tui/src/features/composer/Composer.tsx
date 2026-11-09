// @effect-diagnostics cryptoRandomUUID:off - ids for one send, made in a React key handler.
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import {
  CommandId,
  MessageId,
  type ProjectSearchEntriesResult,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  detectComposerTrigger,
  replaceTextRange,
  serializeComposerFileLink,
} from "@t3tools/shared/composerTrigger";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { Box, Text, usePaste } from "ink";
import { useContext, useState } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey, type KeyPress } from "../../app/keys.ts";
import { composerReplyTargetAtom } from "../../state/composer.ts";
import { environmentShell } from "../../state/shell.ts";
import { environmentThreadDetails } from "../../state/threads.ts";
import { routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { pastedImagePath, readImageAttachment } from "./attachments.ts";
import {
  applyMove,
  cursorLine,
  EMPTY_EDITOR,
  insertText,
  moveLine,
  wrapLines,
  type EditorMove,
  type EditorState,
} from "./editor.ts";
import { buildTurnInput, promptFromMessage, replyAuthor, threadIsRunning } from "./send.ts";
import { RUNTIME_MODE_LABELS, resolveComposerSettings } from "./settings.ts";
import {
  composerDraftAtom,
  composerServer,
  composerThreadCommands,
  projectSearchEntriesAtom,
  threadKey,
  type ComposerDraft,
} from "./state.ts";

const MAX_INPUT_ROWS = 8;
const MENTION_LIMIT = 6;
type SearchAtom = Atom.Atom<AsyncResult.AsyncResult<ProjectSearchEntriesResult, unknown>>;
const noEntriesAtom: SearchAtom = Atom.make(AsyncResult.initial());

const MOVE_KEYS: ReadonlyArray<readonly [string, EditorMove]> = [
  ["arrowleft", "left"],
  ["arrowright", "right"],
  ["ctrl+arrowleft", "wordLeft"],
  ["alt+arrowleft", "wordLeft"],
  ["alt+b", "wordLeft"],
  ["ctrl+arrowright", "wordRight"],
  ["alt+arrowright", "wordRight"],
  ["alt+f", "wordRight"],
  ["home", "home"],
  ["ctrl+a", "home"],
  ["end", "end"],
  ["ctrl+e", "end"],
  ["backspace", "backspace"],
  ["delete", "delete"],
  ["alt+backspace", "deleteWordBack"],
  ["ctrl+u", "deleteToLineStart"],
];

/** shift+enter needs a terminal that reports it (kitty protocol); alt+enter and ctrl+j always work. */
function isNewline(press: KeyPress): boolean {
  return press.input === "\n" || isKey(press, "shift+enter") || isKey(press, "alt+enter");
}

export function Composer({ focused, width, height }: TuiViewProps) {
  const thread = useAtomValue(routeAtom).thread;
  if (thread === null) return null;
  return (
    <ThreadComposer
      key={threadKey(thread)}
      thread={thread}
      focused={focused}
      width={width}
      height={height}
    />
  );
}

function ThreadComposer(props: {
  readonly thread: ScopedThreadRef;
  readonly focused: boolean;
  readonly width: number;
  readonly height: number;
}) {
  const { thread } = props;
  const registry = useContext(RegistryContext);
  const draftAtom = composerDraftAtom(threadKey(thread));
  const draft = useAtomValue(draftAtom);
  const snapshot = Option.getOrNull(
    useAtomValue(environmentShell.stateValueAtom(thread.environmentId)).snapshot,
  );
  const threadShell = snapshot?.threads.find((entry) => entry.id === thread.threadId) ?? null;
  const project = snapshot?.projects.find((entry) => entry.id === threadShell?.projectId) ?? null;
  const config = useAtomValue(composerServer.configValueAtom(thread.environmentId));
  const replyTarget = useAtomValue(composerReplyTargetAtom);
  const reply =
    replyTarget?.thread.environmentId === thread.environmentId &&
    replyTarget.thread.threadId === thread.threadId
      ? replyTarget
      : null;
  const items = useAtomValue(environmentThreadDetails.visibleTurnItemsAtom(thread));
  // The composer has the keyboard while the main pane is focused; escape hands keys to the view.
  const [active, setActive] = useState(true);
  // A new reply target (from the thread view's message actions) gives the composer the keys.
  const [seenReply, setSeenReply] = useState(reply);
  if (reply !== seenReply) {
    setSeenReply(reply);
    if (reply !== null) setActive(true);
  }
  const [history, setHistory] = useState<{
    readonly index: number;
    readonly saved: EditorState;
  } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dismissedMention, setDismissedMention] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { editor } = draft;
  const trigger = detectComposerTrigger(editor.text, editor.cursor);
  const cwd = threadShell?.worktreePath ?? project?.workspaceRoot ?? null;
  const mentionOpen =
    trigger?.kind === "path" && cwd !== null && dismissedMention !== trigger.rangeStart;
  const searchAtom: SearchAtom = mentionOpen
    ? projectSearchEntriesAtom({
        environmentId: thread.environmentId,
        input: { cwd, query: trigger.query, limit: MENTION_LIMIT },
      })
    : noEntriesAtom;
  const search = useAtomValue(searchAtom);
  const mentions = mentionOpen
    ? (AsyncResult.getOrElse(search, () => null)?.entries ?? []).slice(0, MENTION_LIMIT)
    : [];
  const selectedMention = Math.min(mentionIndex, Math.max(0, mentions.length - 1));

  const current = () => registry.get(draftAtom);
  const setDraft = (next: ComposerDraft) => registry.set(draftAtom, next);
  const setEditor = (next: EditorState) => {
    setDraft({ ...current(), editor: next });
    setHistory(null);
    setMentionIndex(0);
    setError(null);
  };

  const prompts = items.flatMap((row) =>
    row.item.type === "user_message" ? [promptFromMessage(row.item.text)].filter(Boolean) : [],
  );
  const recall = (direction: -1 | 1): boolean => {
    const position = history ?? { index: prompts.length, saved: current().editor };
    const index = position.index + direction;
    if (index < 0 || index > prompts.length) return false;
    const text = index === prompts.length ? position.saved.text : prompts[index]!;
    setDraft({ ...current(), editor: { text, cursor: text.length } });
    setHistory(index === prompts.length ? null : { index, saved: position.saved });
    return true;
  };

  const send = (alternate: boolean) => {
    if (threadShell === null) return;
    const before = current();
    const settings = resolveComposerSettings(threadShell, before, config);
    const built = buildTurnInput({
      thread: threadShell,
      draft: before,
      reply,
      provider: settings.provider,
      alternate,
      messageId: MessageId.make(crypto.randomUUID()),
      commandId: CommandId.make(crypto.randomUUID()),
      createdAt: new Date().toISOString(),
    });
    if (built === null) return;
    setDraft({ ...before, editor: EMPTY_EDITOR, attachments: [] });
    if (built.sentReply) registry.set(composerReplyTargetAtom, null);
    setHistory(null);
    setError(null);
    void runAtomCommand(registry, composerThreadCommands.startTurn, {
      environmentId: thread.environmentId,
      input: built.input,
    }).then((result) => {
      if (!AsyncResult.isFailure(result)) return;
      // Give the text back unless the user already started a new message.
      if (current().editor.text.length === 0) setDraft(before);
      if (built.sentReply && registry.get(composerReplyTargetAtom) === null) {
        registry.set(composerReplyTargetAtom, reply);
      }
      setError(`Send failed: ${String(Cause.squash(result.cause))}`);
    });
  };

  const acceptMention = (path: string) => {
    if (!trigger) return;
    setEditor(
      replaceTextRange(
        editor.text,
        trigger.rangeStart,
        trigger.rangeEnd,
        `${serializeComposerFileLink(path)} `,
      ),
    );
  };

  useRegionInput(
    "main",
    (press) => {
      if (!active) {
        if (!isKey(press, "enter") && !isKey(press, "i")) return false;
        setActive(true);
        return true;
      }
      const state = current();
      if (mentions.length > 0 && trigger) {
        if (isKey(press, "arrowup") || isKey(press, "arrowdown")) {
          const step = isKey(press, "arrowup") ? -1 : 1;
          setMentionIndex((selectedMention + step + mentions.length) % mentions.length);
          return true;
        }
        if (isKey(press, "tab") || isKey(press, "enter")) {
          acceptMention(mentions[selectedMention]!.path);
          return true;
        }
        if (isKey(press, "escape")) {
          setDismissedMention(trigger.rangeStart);
          return true;
        }
      }
      if (isKey(press, "escape")) {
        if (reply) registry.set(composerReplyTargetAtom, null);
        else setActive(false);
        return true;
      }
      if (isNewline(press)) {
        setEditor(insertText(state.editor, "\n"));
        return true;
      }
      if (isKey(press, "enter") || isKey(press, "ctrl+s")) {
        send(isKey(press, "ctrl+s"));
        return true;
      }
      if (isKey(press, "arrowup") || isKey(press, "arrowdown")) {
        const direction = isKey(press, "arrowup") ? -1 : 1;
        const moved = moveLine(state.editor, direction);
        if (moved) setEditor(moved);
        else if (history !== null || state.editor.text.length === 0) recall(direction);
        return true;
      }
      if (isKey(press, "backspace") && state.editor.text.length === 0) {
        setDraft({ ...state, attachments: state.attachments.slice(0, -1) });
        return true;
      }
      const move = MOVE_KEYS.find(([shortcut]) => isKey(press, shortcut));
      if (move) {
        setEditor(applyMove(state.editor, move[1]));
        return true;
      }
      if (press.input.length === 0 || press.key.ctrl || press.key.meta || press.key.tab)
        return false;
      setEditor(insertText(state.editor, press.input));
      return true;
    },
    { first: true },
  );

  usePaste(
    (text) => {
      const path = pastedImagePath(text);
      if (path === null) {
        setEditor(insertText(current().editor, text));
        return;
      }
      readImageAttachment(path).then(
        (attachment) => {
          const latest = current();
          setDraft({ ...latest, attachments: [...latest.attachments, attachment] });
        },
        (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
      );
    },
    { isActive: props.focused && active },
  );

  const hasKeys = props.focused && active;
  const textWidth = Math.max(1, props.width - 1);
  const lines = wrapLines(editor.text, textWidth);
  const lineIndex = cursorLine(lines, editor.cursor);
  const rows = Math.max(1, Math.min(MAX_INPUT_ROWS, Math.floor(props.height / 3)));
  const top = Math.max(0, lineIndex - rows + 1);
  const settings = threadShell ? resolveComposerSettings(threadShell, draft, config) : null;
  const running = threadShell ? threadIsRunning(threadShell) : false;
  const effortLabel = settings?.effort?.options.find(
    (option) => option.id === settings.effortValue,
  )?.label;

  return (
    <Box flexDirection="column" width={props.width}>
      {reply && (
        <Box>
          <Box width={Math.max(1, props.width - 7)}>
            <Text color={theme.textMuted} wrap="truncate">
              <Text color={theme.accent}>↳ </Text>
              Replying to {replyAuthor(reply.role)}: {reply.text.replace(/\s+/g, " ")}
            </Text>
          </Box>
          <Text color={theme.textFaint}> esc ✕</Text>
        </Box>
      )}
      {draft.attachments.length > 0 && (
        <Text color={theme.info} wrap="truncate">
          {draft.attachments.map((attachment) => `[image ${attachment.name}]`).join(" ")}
          <Text color={theme.textFaint}> backspace on empty removes</Text>
        </Text>
      )}
      {mentions.map((entry, index) => (
        <Text
          key={entry.path}
          color={index === selectedMention ? theme.accent : theme.textMuted}
          {...(index === selectedMention ? { backgroundColor: theme.selection } : {})}
          wrap="truncate"
        >
          @ {entry.path}
        </Text>
      ))}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderColor={hasKeys ? theme.borderFocused : theme.border}
      >
        {editor.text.length === 0 ? (
          <Text color={theme.textFaint} wrap="truncate">
            {hasKeys && <Text inverse> </Text>}
            {hasKeys ? "Message, @ for files" : "Message"}
          </Text>
        ) : (
          lines.slice(top, top + rows).map((line, offset) => {
            const index = top + offset;
            if (!hasKeys || index !== lineIndex) {
              return (
                <Text key={line.start} color={theme.text}>
                  {line.text || " "}
                </Text>
              );
            }
            const column = editor.cursor - line.start;
            return (
              <Text key={line.start} color={theme.text}>
                {line.text.slice(0, column)}
                <Text inverse>{line.text[column] ?? " "}</Text>
                {line.text.slice(column + 1)}
              </Text>
            );
          })
        )}
      </Box>
      {error && (
        <Text color={theme.danger} wrap="truncate">
          {error}
        </Text>
      )}
      <Box justifyContent="space-between" gap={2}>
        <Text color={theme.textMuted} wrap="truncate">
          {settings
            ? [
                settings.model?.name ?? settings.selection.model,
                effortLabel,
                RUNTIME_MODE_LABELS[settings.runtimeMode],
                settings.interactionMode === "plan" ? "plan" : undefined,
              ]
                .filter(Boolean)
                .join(" · ")
            : ""}
        </Text>
        <Text color={theme.textFaint} wrap="truncate">
          {props.focused && !active
            ? "enter or i to type"
            : `${running ? "enter steer · ctrl+s queue" : "enter send · ctrl+j newline"} · ctrl+l model`}
        </Text>
      </Box>
    </Box>
  );
}
