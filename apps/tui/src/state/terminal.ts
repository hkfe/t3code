import { Atom } from "effect/reactivity";

/** From focus reports (`CSI ?1004h`). Stays true when the terminal never sends them. */
export const terminalFocusedAtom = Atom.make(true).pipe(Atom.keepAlive);
