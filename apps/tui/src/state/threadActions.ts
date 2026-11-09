import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

/**
 * The thread the next thread action applies to. The sidebar sets its selected row here, then
 * runs a `thread.*` or `thread-actions.*` command, which clears it. Null: the open thread.
 */
export const threadActionTargetAtom = Atom.make<ScopedThreadRef | null>(null).pipe(Atom.keepAlive);
