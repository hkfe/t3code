import {
  dismissThreadUserInput,
  respondToThreadApproval,
  respondToThreadUserInput,
  type DismissThreadUserInputInput,
  type RespondToThreadApprovalInput,
  type RespondToThreadUserInputInput,
} from "@t3tools/client-runtime/operations";
import { createEnvironmentCommand } from "@t3tools/client-runtime/state/runtime";
import { createEnvironmentSessionAtoms } from "@t3tools/client-runtime/state/session";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";

import { connectionAtomRuntime } from "../connection/runtime.ts";

/** Per environment: the bearer session, whose scopes say what this client may do. */
export const environmentSession = createEnvironmentSessionAtoms(connectionAtomRuntime);

// Command ids are random UUIDs; the shared runtime does not provide SecureRandom.
const withRandom = Effect.provide(SecureRandom.layerWebCrypto);

/** The commands web and mobile use to answer approvals and agent questions. */
export const requestCommands = {
  respondToApproval: createEnvironmentCommand(connectionAtomRuntime, {
    label: "tui:requests:respond-to-approval",
    execute: (input: RespondToThreadApprovalInput) => withRandom(respondToThreadApproval(input)),
  }),
  respondToUserInput: createEnvironmentCommand(connectionAtomRuntime, {
    label: "tui:requests:respond-to-user-input",
    execute: (input: RespondToThreadUserInputInput) => withRandom(respondToThreadUserInput(input)),
  }),
  dismissUserInput: createEnvironmentCommand(connectionAtomRuntime, {
    label: "tui:requests:dismiss-user-input",
    execute: (input: DismissThreadUserInputInput) => withRandom(dismissThreadUserInput(input)),
  }),
};
