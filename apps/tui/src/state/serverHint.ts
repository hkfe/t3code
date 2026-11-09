import { Atom } from "effect/reactivity";

/** Origin the pairing screen points to: `--server`, else the local desktop server, if found. */
export const serverHintAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive);
