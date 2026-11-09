import { Atom } from "effect/reactivity";

/** Wrap long diff lines; shared by every diff, kept for the session. */
export const diffWrapAtom = Atom.make(false).pipe(Atom.keepAlive);

/** Viewed paths where the server keeps none (turn diffs, hosts without viewed files), per scope key. */
export const localViewedAtom = Atom.family((_scope: string) =>
  Atom.make<ReadonlySet<string>>(new Set<string>() as ReadonlySet<string>).pipe(Atom.keepAlive),
);
