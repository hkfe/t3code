import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import { Text } from "ink";
import { useContext, useState } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { composerReplyTargetAtom } from "../../state/composer.ts";
import { messageSelectionAtom } from "../../state/messageSelection.ts";
import { threadEnvironment } from "../../state/threadCommands.ts";
import { environmentThreadDetails } from "../../state/threads.ts";
import { focusAtom, routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import {
  ACTION_KEYS,
  availableActions,
  isMessage,
  messageText,
  osc52,
  quotedMessageId,
  type Message,
  type MessageAction,
} from "./actions.ts";

const random = SecureRandom.make((size) => globalThis.crypto.getRandomValues(new Uint8Array(size)));

function Actions({ thread }: { readonly thread: ScopedThreadRef }) {
  const registry = useContext(RegistryContext);
  const rows = useAtomValue(environmentThreadDetails.visibleTurnItemsAtom(thread));
  const title = useAtomValue(environmentThreadDetails.threadAtom(thread))?.projection.thread.title;
  const selection = useAtomValue(messageSelectionAtom);
  const [note, setNote] = useState<{ readonly itemId: string; readonly text: string } | null>(null);

  const onThread = selection?.thread.threadId === thread.threadId ? selection : null;
  const message = rows.map((row) => row.item).find((item) => item.id === onThread?.itemId);
  const actions = message && isMessage(message) ? availableActions(message) : [];

  const run = (action: MessageAction, message: Message) => {
    const say = (text: string) => setNote({ itemId: message.id, text });
    if (action === "reply") {
      registry.set(composerReplyTargetAtom, {
        thread,
        messageId: message.messageId,
        role: message.type === "user_message" ? "user" : "assistant",
        text: messageText(message),
      });
      registry.set(focusAtom, "main");
    } else if (action === "copy") {
      const text = messageText(message);
      const sequence = osc52(text, process.env, process.stdout.isTTY === true);
      if (sequence === null) return say("this terminal has no OSC 52 clipboard");
      process.stdout.write(sequence);
      say(`copied ${text.length} chars (OSC 52)`);
    } else if (action === "original") {
      const quoted = quotedMessageId(message);
      const original = rows
        .map((row) => row.item)
        .find((item) => isMessage(item) && item.messageId === quoted);
      if (!original) return say("the original message is not loaded");
      registry.set(messageSelectionAtom, { thread, itemId: original.id, messageId: quoted });
    } else if (message.runId !== null) {
      const fork = {
        environmentId: thread.environmentId,
        threadId: ThreadId.make(Effect.runSync(random.uuidV4())),
      };
      say("forking…");
      void runAtomCommand(
        registry,
        threadEnvironment.forkFromRun,
        {
          environmentId: thread.environmentId,
          input: {
            sourceThreadId: thread.threadId,
            targetThreadId: fork.threadId,
            runId: message.runId,
            title: `${title ?? "Thread"} fork`,
          },
        },
        {},
        // A no-op reporter: console output would draw over the Ink screen.
        { warn() {}, error() {} },
      ).then((result) => {
        if (isAtomCommandInterrupted(result)) return;
        if (result._tag === "Failure") {
          const error = squashAtomCommandFailure(result);
          return say(`fork failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        registry.set(messageSelectionAtom, null);
        registry.set(routeAtom, { view: "thread", thread: fork });
      });
    }
  };

  useRegionInput("main", (press) => {
    if (!message || !isMessage(message) || press.key.ctrl || press.key.meta) return false;
    const action = ACTION_KEYS.find(({ key }) => key === press.input)?.action;
    if (!action || !actions.includes(action)) return false;
    run(action, message);
    return true;
  });

  if (!message || actions.length === 0) return null;
  const hint = ACTION_KEYS.filter(({ action }) => actions.includes(action))
    .map(({ key, action }) => `${key} ${action}`)
    .join(" · ");
  return (
    <Text wrap="truncate">
      <Text color={theme.accent}>{"▌ "}</Text>
      <Text color={theme.textFaint}>{hint}</Text>
      {note?.itemId === message.id && <Text color={theme.textMuted}>{`  ${note.text}`}</Text>}
    </Text>
  );
}

/** Under the thread: the selected message's action keys, handled in the main region. */
export function MessageActions(_props: TuiViewProps) {
  const thread = useAtomValue(routeAtom).thread;
  if (thread === null) return null;
  return <Actions key={`${thread.environmentId}:${thread.threadId}`} thread={thread} />;
}
