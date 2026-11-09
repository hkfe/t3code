import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

/**
 * The sidebar's selected thread row (null on a header). While the sidebar has focus, thread
 * actions and "open to the side" act on it instead of the open thread.
 */
export const threadActionTargetAtom = Atom.make<ScopedThreadRef | null>(null).pipe(Atom.keepAlive);
