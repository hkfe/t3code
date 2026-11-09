import { createEnvironmentShellAtoms } from "@t3tools/client-runtime/state/shell";

import { connectionAtomRuntime } from "../connection/runtime.ts";

/** Per environment: projects and thread shells, live from the server's shell stream. */
export const environmentShell = createEnvironmentShellAtoms(connectionAtomRuntime);
