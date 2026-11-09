import { isAtomCommandInterrupted, runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import {
  AuthTerminalOperateScope,
  type EnvironmentId,
  type ScopedThreadRef,
  sessionGrantsScope,
  type TerminalSummary,
} from "@t3tools/contracts";
import { nextTerminalId } from "@t3tools/shared/terminalLabels";
import { AsyncResult, Atom, type AtomRegistry } from "effect/reactivity";

import { environmentSession } from "../../state/requests.ts";
import { terminalEnvironment } from "../../state/threadTerminals.ts";
import { focusAtom, layoutAtom } from "../../state/ui.ts";

export const TERMINAL_PANEL = "terminal";
export const TERMINAL_VIEW = "terminal";

/** The terminal each thread shows, once picked. Null: none, after the last one ended. */
export const selectedTerminalAtom = Atom.make<ReadonlyMap<string, string | null>>(new Map()).pipe(
  Atom.keepAlive,
);
/** Names given with rename. The server has no terminal rename, so they stay in memory. */
export const terminalNamesAtom = Atom.make<ReadonlyMap<string, string>>(new Map()).pipe(
  Atom.keepAlive,
);

/** An empty name goes back to the server's label. */
export function renameTerminal(registry: AtomRegistry.AtomRegistry, key: string, name: string) {
  const next = new Map(registry.get(terminalNamesAtom));
  if (name.trim() === "") next.delete(key);
  else next.set(key, name.trim());
  registry.set(terminalNamesAtom, next);
}

export const threadKey = (thread: ScopedThreadRef) => `${thread.environmentId}:${thread.threadId}`;
export const terminalKey = (thread: ScopedThreadRef, terminalId: string) =>
  `${threadKey(thread)}:${terminalId}`;

const compare = new Intl.Collator(undefined, { numeric: true }).compare;

/** The thread's sessions in tab order. */
export function threadTerminalIds(
  summaries: ReadonlyArray<TerminalSummary>,
  thread: ScopedThreadRef,
): ReadonlyArray<string> {
  return summaries
    .filter((summary) => summary.threadId === thread.threadId)
    .map((summary) => summary.terminalId)
    .toSorted(compare);
}

/**
 * The listed tabs plus a picked session the server has not listed yet. With `autoStart` and
 * nothing listed or picked, it shows the first id, so opening the terminal starts a shell.
 */
export function terminalTabs(
  ids: ReadonlyArray<string>,
  picked: string | null | undefined,
  autoStart = false,
): { readonly tabs: ReadonlyArray<string>; readonly selected: string | null } {
  if (picked === undefined && ids.length === 0 && autoStart) picked = nextTerminalId([]);
  if (picked === null) return { tabs: ids, selected: null };
  if (picked === undefined) return { tabs: ids, selected: ids[0] ?? null };
  return { tabs: ids.includes(picked) ? ids : [...ids, picked], selected: picked };
}

export function canOperate(registry: AtomRegistry.AtomRegistry, environmentId: EnvironmentId) {
  const session = registry.get(environmentSession.sessionStateValueAtom(environmentId));
  return session !== null && sessionGrantsScope(session, AuthTerminalOperateScope);
}

function readTabs(registry: AtomRegistry.AtomRegistry, thread: ScopedThreadRef) {
  const metadata = registry.get(
    terminalEnvironment.metadata({ environmentId: thread.environmentId, input: null }),
  );
  const ids = threadTerminalIds(
    AsyncResult.getOrElse(metadata, () => []),
    thread,
  );
  return terminalTabs(ids, registry.get(selectedTerminalAtom).get(threadKey(thread)));
}

export function pickTerminal(
  registry: AtomRegistry.AtomRegistry,
  thread: ScopedThreadRef,
  terminalId: string | null,
) {
  const next = new Map(registry.get(selectedTerminalAtom));
  registry.set(selectedTerminalAtom, next.set(threadKey(thread), terminalId));
}

/** Picks a fresh id. The terminal view attaches to it only with operate access. */
export function newTerminal(registry: AtomRegistry.AtomRegistry, thread: ScopedThreadRef) {
  pickTerminal(registry, thread, nextTerminalId(readTabs(registry, thread).tabs));
}

/** Shows the tab next to `terminalId`, or none when it was the last. */
export function leaveTerminal(
  registry: AtomRegistry.AtomRegistry,
  thread: ScopedThreadRef,
  terminalId: string,
) {
  const { tabs } = readTabs(registry, thread);
  const index = tabs.indexOf(terminalId);
  const rest = tabs.filter((id) => id !== terminalId);
  pickTerminal(registry, thread, rest[Math.min(Math.max(index, 0), rest.length - 1)] ?? null);
}

/** Ends the session and deletes its history, as web does. A failed close types `exit`. */
export function closeTerminal(
  registry: AtomRegistry.AtomRegistry,
  thread: ScopedThreadRef,
  terminalId: string,
) {
  if (!canOperate(registry, thread.environmentId)) return;
  const { environmentId, threadId } = thread;
  leaveTerminal(registry, thread, terminalId);
  void runAtomCommand(registry, terminalEnvironment.close, {
    environmentId,
    input: { threadId, terminalId, deleteHistory: true },
  }).then((result) => {
    if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
    if (!canOperate(registry, environmentId)) return;
    void runAtomCommand(registry, terminalEnvironment.write, {
      environmentId,
      input: { threadId, terminalId, data: "exit\n" },
    });
  });
}

export function selectedTerminal(registry: AtomRegistry.AtomRegistry, thread: ScopedThreadRef) {
  return readTabs(registry, thread).selected;
}

/** Opens the terminal panel and focuses it, or closes it when `toggle` and it is open. */
export function showTerminalPanel(registry: AtomRegistry.AtomRegistry, toggle: boolean) {
  const layout = registry.get(layoutAtom);
  const close = toggle && layout.panel === TERMINAL_PANEL;
  registry.set(layoutAtom, { ...layout, panel: close ? null : TERMINAL_PANEL });
  registry.set(focusAtom, close ? "main" : "panel");
}
