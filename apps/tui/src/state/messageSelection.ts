import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

/**
 * The block the thread view cursor is on (`[` / `]`). `messageId` is set when it is a user or
 * assistant message, so a later "reply to this message" action can quote it.
 */
export interface MessageSelection {
  readonly thread: ScopedThreadRef;
  readonly itemId: string;
  readonly messageId: string | null;
}

export const messageSelectionAtom = Atom.make<MessageSelection | null>(null).pipe(Atom.keepAlive);
