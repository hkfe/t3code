import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import type { OrchestrationV2ThreadShell, ScopedThreadRef } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";

import { environmentCatalog } from "../../state/catalog.ts";
import { environmentShell } from "../../state/shell.ts";

/** Same rule as derivePendingThreadRequests: auth refreshes and tool calls are not for the user. */
export function threadNeedsYou(
  thread: Pick<OrchestrationV2ThreadShell, "archivedAt" | "pendingRuntimeRequest">,
): boolean {
  const kind = thread.pendingRuntimeRequest?.kind;
  return (
    thread.archivedAt === null &&
    kind !== undefined &&
    kind !== "auth_refresh" &&
    kind !== "dynamic_tool_call"
  );
}

/** The thread after `current` in `threads`, wrapping; the first one when `current` is absent. */
export function nextThread(
  threads: ReadonlyArray<ScopedThreadRef>,
  current: ScopedThreadRef | null,
): ScopedThreadRef | null {
  const index = current === null ? -1 : threads.findIndex((ref) => sameThread(ref, current));
  return threads[(index + 1) % threads.length] ?? null;
}

export function sameThread(a: ScopedThreadRef, b: ScopedThreadRef): boolean {
  return a.environmentId === b.environmentId && a.threadId === b.threadId;
}

/** Threads of every enabled environment waiting on the user, oldest request first. */
export const needsYouAtom = Atom.make((get): ReadonlyArray<ScopedThreadRef> => {
  const waiting: Array<{ ref: ScopedThreadRef; since: number }> = [];
  for (const environmentId of enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))) {
    const snapshot = get(environmentShell.stateValueAtom(environmentId)).snapshot;
    if (Option.isNone(snapshot)) continue;
    for (const thread of snapshot.value.threads) {
      if (!threadNeedsYou(thread) || thread.pendingRuntimeRequest === null) continue;
      waiting.push({
        ref: { environmentId, threadId: thread.id },
        since: DateTime.toEpochMillis(thread.pendingRuntimeRequest.createdAt),
      });
    }
  }
  return waiting.toSorted((a, b) => a.since - b.since).map((entry) => entry.ref);
}).pipe(Atom.withLabel("tui-requests-needs-you"));
