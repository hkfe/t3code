import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

export interface Toast {
  readonly text: string;
  readonly tone: "success" | "warning" | "danger" | "info";
  /** Key hint after the text, such as "ctrl+g open". */
  readonly hint?: string;
  /** The thread the toast is about, for a command that opens it. */
  readonly thread?: ScopedThreadRef;
}

/** One transient line above the status bar; null hides it. */
export const toastAtom = Atom.make<Toast | null>(null).pipe(Atom.keepAlive);
