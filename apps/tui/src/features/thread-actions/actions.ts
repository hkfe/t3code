import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
  type AtomCommand,
} from "@t3tools/client-runtime/state/runtime";
import { threadChipCopyTarget } from "@t3tools/client-runtime/thread-reference";
import {
  AuthOrchestrationOperateScope,
  sessionGrantsScope,
  type EnvironmentId,
  type OrchestrationV2ThreadShell,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom, type AtomRegistry } from "effect/reactivity";

import { environmentSession } from "../../state/settings.ts";
import { environmentShell } from "../../state/shell.ts";
import { threadActionTargetAtom } from "../../state/threadActions.ts";
import { threadEnvironment } from "../../state/threadCommands.ts";
import { overlayAtom, routeAtom } from "../../state/ui.ts";
import { isSnoozed, type ThreadAction } from "./menu.ts";

type Registry = AtomRegistry.AtomRegistry;

export type MenuMode = "root" | "snooze" | "snooze-custom" | "labels" | "rename" | "delete";

export interface MenuState {
  readonly thread: ScopedThreadRef;
  readonly mode: MenuMode;
  readonly error: string | null;
}

export const MENU_OVERLAY = "thread-actions.menu";
export const menuAtom = Atom.make<MenuState | null>(null).pipe(Atom.keepAlive);

export function openMenu(
  registry: Registry,
  thread: ScopedThreadRef,
  mode: MenuMode = "root",
  error: string | null = null,
) {
  registry.set(menuAtom, { thread, mode, error });
  registry.set(overlayAtom, MENU_OVERLAY);
}

function closeMenu(registry: Registry) {
  if (registry.get(overlayAtom) === MENU_OVERLAY) registry.set(overlayAtom, null);
}

/** Active or archived shell of a thread, or undefined for a draft or an unknown thread. */
export function findThreadShell(
  snapshot: Option.Option<{
    readonly threads: ReadonlyArray<OrchestrationV2ThreadShell>;
    readonly archivedThreads: ReadonlyArray<OrchestrationV2ThreadShell>;
  }>,
  threadId: ScopedThreadRef["threadId"],
): OrchestrationV2ThreadShell | undefined {
  if (Option.isNone(snapshot)) return undefined;
  const { threads, archivedThreads } = snapshot.value;
  return (
    threads.find((thread) => thread.id === threadId) ??
    archivedThreads.find((thread) => thread.id === threadId)
  );
}

function readThreadShell(registry: Registry, ref: ScopedThreadRef) {
  return findThreadShell(
    registry.get(environmentShell.stateValueAtom(ref.environmentId)).snapshot,
    ref.threadId,
  );
}

/** Whether this client may change threads in the environment (the server still checks). */
export const canOperateAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get) => {
    const session = get(environmentSession.sessionStateValueAtom(environmentId));
    return session !== null && sessionGrantsScope(session, AuthOrchestrationOperateScope);
  }),
);

/** The sidebar's chosen thread if it set one (cleared here), else the open thread. */
export function takeActionTarget(registry: Registry): ScopedThreadRef | null {
  const target = registry.get(threadActionTargetAtom);
  if (target !== null) registry.set(threadActionTargetAtom, null);
  return target ?? registry.get(routeAtom).thread;
}

/** Runs a client-runtime command. Returns the error message, or null on success. */
export async function runCommand<W, A, E>(
  registry: Registry,
  command: AtomCommand<W, A, E>,
  input: W,
): Promise<string | null> {
  // A no-op reporter: console output would draw over the Ink screen.
  const result = await runAtomCommand(registry, command, input, {}, { warn() {}, error() {} });
  if (result._tag === "Success" || isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : String(error);
}

/** OSC 52: the terminal sets its clipboard, also over SSH. Terminals without it ignore it. */
function copyToClipboard(text: string) {
  process.stdout.write(`\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`);
}

/** Closes the menu on success; on failure shows the error in the menu. */
export async function settle(
  registry: Registry,
  ref: ScopedThreadRef,
  run: Promise<string | null>,
  mode: MenuMode = "root",
) {
  const error = await run;
  if (error === null) closeMenu(registry);
  else openMenu(registry, ref, mode, error);
}

function leaveIfOpen(registry: Registry, ref: ScopedThreadRef) {
  const route = registry.get(routeAtom);
  if (route.thread?.threadId === ref.threadId)
    registry.set(routeAtom, { view: "home", thread: null });
}

export async function deleteThread(registry: Registry, ref: ScopedThreadRef) {
  const error = await runCommand(registry, threadEnvironment.delete, {
    environmentId: ref.environmentId,
    input: { threadId: ref.threadId },
  });
  if (error === null) leaveIfOpen(registry, ref);
  return error;
}

/** Toggles act at once; actions that need input open their menu page. */
export function runThreadAction(registry: Registry, ref: ScopedThreadRef, action: ThreadAction) {
  const thread = readThreadShell(registry, ref);
  if (thread === undefined) return;
  const target = { environmentId: ref.environmentId };
  const input = { threadId: ref.threadId };
  const run = (promise: Promise<string | null>) => void settle(registry, ref, promise);
  switch (action) {
    case "pin":
      return run(
        runCommand(
          registry,
          thread.pinnedAt != null ? threadEnvironment.unpin : threadEnvironment.pin,
          { ...target, input },
        ),
      );
    case "settle":
      return run(
        thread.settledOverride === "settled"
          ? runCommand(registry, threadEnvironment.unsettle, {
              ...target,
              input: { ...input, reason: "user" },
            })
          : runCommand(registry, threadEnvironment.settle, { ...target, input }),
      );
    case "snooze":
      if (!isSnoozed(thread, new Date())) return openMenu(registry, ref, "snooze");
      return run(
        runCommand(registry, threadEnvironment.unsnooze, {
          ...target,
          input: { ...input, reason: "user" },
        }),
      );
    case "labels":
    case "rename":
    case "delete":
      return openMenu(registry, ref, action);
    case "regenerate-title":
      if (thread.titleRegeneration != null) return;
      return run(
        runCommand(registry, threadEnvironment.updateMetadata, {
          ...target,
          input: { ...input, regenerateTitle: true },
        }),
      );
    case "mark-unread":
      return run(runCommand(registry, threadEnvironment.markUnread, { ...target, input }));
    case "copy-link":
      copyToClipboard(threadChipCopyTarget(ref, thread.title).value);
      return closeMenu(registry);
    case "copy-id":
      copyToClipboard(ref.threadId);
      return closeMenu(registry);
    case "archive":
      if (thread.archivedAt != null) {
        return run(runCommand(registry, threadEnvironment.unarchive, { ...target, input }));
      }
      return run(
        runCommand(registry, threadEnvironment.archive, { ...target, input }).then((error) => {
          if (error === null) leaveIfOpen(registry, ref);
          return error;
        }),
      );
  }
}
