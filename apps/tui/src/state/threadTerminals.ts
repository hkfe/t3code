import { createTerminalEnvironmentAtoms } from "@t3tools/client-runtime/state/terminal";

import { connectionAtomRuntime } from "../connection/runtime.ts";

/** Per environment: terminal metadata, attach and observe streams, and the terminal commands. */
export const terminalEnvironment = createTerminalEnvironmentAtoms(connectionAtomRuntime);
