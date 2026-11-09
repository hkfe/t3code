import { ConnectionOnboarding } from "@t3tools/client-runtime/connection";
import { createEnvironmentCatalogAtoms } from "@t3tools/client-runtime/state/connections";
import { createRuntimeCommand } from "@t3tools/client-runtime/state/runtime";
import * as Effect from "effect/Effect";

import { connectionAtomRuntime } from "../connection/runtime.ts";

export const environmentCatalog = createEnvironmentCatalogAtoms(connectionAtomRuntime);

/** Exchanges a pairing URL (`https://host:port/pair#token=...`) for a saved bearer session. */
export const connectPairingUrl = createRuntimeCommand(connectionAtomRuntime, {
  label: "tui:connection:connect-pairing-url",
  concurrency: {
    mode: "singleFlight",
    key: (input: { readonly pairingUrl: string }) => input.pairingUrl,
  },
  execute: (input: { readonly pairingUrl: string }) =>
    ConnectionOnboarding.ConnectionOnboarding.pipe(
      Effect.flatMap((onboarding) => onboarding.registerPairing(input)),
    ),
});
