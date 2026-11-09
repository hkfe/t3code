import { createServerEnvironmentAtoms } from "@t3tools/client-runtime/state/server";
import type { ServerConfig } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime.ts";

// No offline cache, so a config is known only once the server sends it.
const noInitialConfig = Atom.make<ServerConfig | null>(null);

/** Per environment: server config and settings (`settingsValueAtom`: thread labels...). */
export const serverEnvironment = createServerEnvironmentAtoms(connectionAtomRuntime, {
  initialConfigValueAtom: () => noInitialConfig,
});
