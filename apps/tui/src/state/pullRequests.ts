import { createPullRequestEnvironmentAtoms } from "@t3tools/client-runtime/state/pull-requests";

import { connectionAtomRuntime } from "../connection/runtime.ts";

export const pullRequestAtoms = createPullRequestEnvironmentAtoms(connectionAtomRuntime);
