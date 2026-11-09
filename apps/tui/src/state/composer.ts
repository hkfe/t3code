import type { MessageId, ReplyContextRecord, ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

/** A message the next send quotes. Set it to reply; the composer clears it after the send. */
export interface ComposerReplyTarget {
  readonly thread: ScopedThreadRef;
  readonly messageId: MessageId;
  readonly role: ReplyContextRecord["role"];
  /** The message text; the composer shows a preview and sends it clamped. */
  readonly text: string;
}

// ponytail: in memory, one target for the app; the chip shows only on its own thread.
export const composerReplyTargetAtom = Atom.make<ComposerReplyTarget | null>(null).pipe(
  Atom.keepAlive,
);
