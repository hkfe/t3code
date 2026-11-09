import { createOrchestrationEnvironmentAtoms } from "@t3tools/client-runtime/state/orchestration";

import { connectionAtomRuntime } from "../connection/runtime.ts";

/** Per environment: orchestration queries such as thread search and diffs. */
export const orchestrationEnvironment = createOrchestrationEnvironmentAtoms(connectionAtomRuntime);
