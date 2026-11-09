import { createEnvironmentThreadShellAtoms } from "@t3tools/client-runtime/state/threads";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";

import { environmentCatalog } from "./catalog.ts";
import { serverEnvironment } from "./settings.ts";
import { environmentShell } from "./shell.ts";

const snapshotAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get) =>
    Option.getOrNull(get(environmentShell.stateValueAtom(environmentId)).snapshot),
  ),
);

/** Thread shells of every enabled environment, presented as web and mobile list them. */
export const environmentThreadShells = createEnvironmentThreadShellAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom,
  hiddenThreadTagsAtom: serverEnvironment.hiddenThreadTagsAtom,
});
