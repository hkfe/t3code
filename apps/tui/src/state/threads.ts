import {
  createEnvironmentThreadDetailAtoms,
  createEnvironmentThreadStateAtoms,
} from "@t3tools/client-runtime/state/threads";

import { connectionAtomRuntime } from "../connection/runtime.ts";

/** Per thread: the live detail subscription and the projections read from it. */
const environmentThreads = createEnvironmentThreadStateAtoms(connectionAtomRuntime);
export const environmentThreadDetails = createEnvironmentThreadDetailAtoms(
  environmentThreads.stateAtom,
);
