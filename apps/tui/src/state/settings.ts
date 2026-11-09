import { createServerEnvironmentAtoms } from "@t3tools/client-runtime/state/server";
import { createEnvironmentSessionAtoms } from "@t3tools/client-runtime/state/session";

import { connectionAtomRuntime } from "../connection/runtime.ts";

/** Per environment: the session grants (scopes) of this client. */
export const environmentSession = createEnvironmentSessionAtoms(connectionAtomRuntime);

/** Per environment: server config and settings (`settingsValueAtom`: thread labels, snooze presets...). */
export const serverEnvironment = createServerEnvironmentAtoms(connectionAtomRuntime, {
  initialConfigValueAtom: environmentSession.initialConfigValueAtom,
});
