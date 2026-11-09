import { createPullRequestEnvironmentAtoms } from "@t3tools/client-runtime/state/pull-requests";

import { connectionAtomRuntime } from "../connection/runtime.ts";

/** Per environment and pull request: detail, activity, checks, check logs, diff. */
export const pullRequestAtoms = createPullRequestEnvironmentAtoms(connectionAtomRuntime);
