import type { AtomRegistry } from "effect/reactivity";

import type { KeyContext, TuiCommand, TuiFeature } from "../../app/feature.ts";
import { overlayAtom } from "../../state/ui.ts";
import { MENU_OVERLAY, openMenu, runThreadAction, takeActionTarget } from "./actions.ts";
import type { ThreadAction } from "./menu.ts";
import { NEW_THREAD_OVERLAY } from "./newThread.ts";
import { NewThreadOverlay } from "./NewThreadOverlay.tsx";
import { ThreadActionsOverlay } from "./ThreadActionsOverlay.tsx";

function onTarget(
  id: string,
  title: string,
  run: (
    registry: AtomRegistry.AtomRegistry,
    ref: NonNullable<ReturnType<typeof takeActionTarget>>,
  ) => void,
): TuiCommand {
  return {
    id,
    title,
    run: ({ registry }) => {
      const ref = takeActionTarget(registry);
      if (ref !== null) run(registry, ref);
    },
  };
}

const action = (id: string, title: string, threadAction: ThreadAction) =>
  onTarget(id, title, (registry, ref) => runThreadAction(registry, ref, threadAction));

const noOverlay = ({ overlay }: KeyContext) => overlay === null;

/** Ids match web `KeybindingCommand` where web has the action (`chat.new`, `thread.pin`...). */
export const threadActionsFeature: TuiFeature = {
  id: "thread-actions",
  commands: [
    {
      id: "chat.new",
      title: "New thread…",
      run: ({ registry }) => registry.set(overlayAtom, NEW_THREAD_OVERLAY),
    },
    onTarget("thread-actions.menu", "Thread actions…", (registry, ref) => openMenu(registry, ref)),
    action("thread.pin", "Pin or unpin thread", "pin"),
    action("thread.settle", "Settle or un-settle thread", "settle"),
    action("thread-actions.snooze", "Snooze or wake thread…", "snooze"),
    action("thread-actions.labels", "Thread labels…", "labels"),
    action("thread-actions.rename", "Rename thread…", "rename"),
    action("thread-actions.regenerateTitle", "Regenerate thread title", "regenerate-title"),
    action("thread-actions.markUnread", "Mark thread unread", "mark-unread"),
    action("thread.copyReference", "Copy thread link", "copy-link"),
    action("thread-actions.copyId", "Copy thread ID", "copy-id"),
    action("thread-actions.archive", "Archive or unarchive thread", "archive"),
    action("thread-actions.delete", "Delete thread…", "delete"),
  ],
  keybindings: [
    { key: "ctrl+n", command: "chat.new", when: noOverlay },
    { key: "ctrl+o", command: "thread-actions.menu", when: noOverlay },
  ],
  overlays: [
    { id: MENU_OVERLAY, component: ThreadActionsOverlay },
    { id: NEW_THREAD_OVERLAY, component: NewThreadOverlay },
  ],
};
