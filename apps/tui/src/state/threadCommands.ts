import {
  createThreadEnvironmentAtoms,
  createThreadFamilyAtoms,
} from "@t3tools/client-runtime/state/threads";

import { connectionAtomRuntime } from "../connection/runtime.ts";
import { environmentShell } from "./shell.ts";

const threadFamilies = createThreadFamilyAtoms(connectionAtomRuntime, environmentShell.stateAtom);

/** Thread mutations (pin, settle, snooze, archive, delete, setTag...), as on web and mobile. */
export const threadEnvironment = createThreadEnvironmentAtoms(
  connectionAtomRuntime,
  threadFamilies.snapshotAtom,
);
