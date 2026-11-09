// @effect-diagnostics effectFnOpportunity:off - one-line service stubs; spans would add noise.
import {
  ConnectionBlockedError,
  Connection,
  Connectivity,
  Wakeups,
} from "@t3tools/client-runtime/connection";
import {
  ClientCapabilities,
  Persistence,
  PlatformConnectionSource,
} from "@t3tools/client-runtime/platform";
import { ManagedRelay } from "@t3tools/client-runtime/relay";
import { layerRemoteHttpClient } from "@t3tools/client-runtime/rpc";
import { PullRequestDiffLoader } from "@t3tools/client-runtime/state/pull-requests";
import { ShellSnapshotLoader } from "@t3tools/client-runtime/state/shell";
import {
  BoundedThreadSnapshotLoader,
  ThreadHistoryController,
} from "@t3tools/client-runtime/state/threads";
import { RelayWebClientId } from "@t3tools/contracts/relay";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Socket from "effect/socket/Socket";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Atom, AtomRegistry } from "effect/reactivity";
import * as NodeOS from "node:os";

import packageJson from "../../package.json" with { type: "json" };
import { resolveConfigDir } from "./configDir.ts";
import * as ConnectionStorage from "./storage.ts";

const unsupported = (detail: string) =>
  new ConnectionBlockedError({ reason: "unsupported", detail });
const sshUnsupported = () =>
  Effect.fail(unsupported("SSH environments are only available in the desktop app."));
const relayUnavailable = () => Effect.die("T3 Connect is not available in the terminal app.");

// No offline cache yet: every launch reads the shell and threads from the server.
const layerNoEnvironmentCache = Layer.succeed(Persistence.EnvironmentCacheStore, {
  loadShell: () => Effect.succeedNone,
  saveShell: () => Effect.void,
  loadThread: () => Effect.succeedNone,
  saveThread: () => Effect.void,
  removeThread: () => Effect.void,
  loadServerConfig: () => Effect.succeedNone,
  saveServerConfig: () => Effect.void,
  loadVcsRefs: () => Effect.succeedNone,
  saveVcsRefs: () => Effect.void,
  removeVcsRefs: () => Effect.void,
  clearVcsRefs: () => Effect.void,
  clear: () => Effect.void,
});

// The TUI pairs straight to a server; T3 Connect, SSH and relay routes are not offered.
const layerCapabilities = Layer.mergeAll(
  Layer.succeed(ClientCapabilities.CloudSession, {
    identity: Effect.succeedNone,
    clerkToken: Effect.fail(unsupported("T3 Connect is not available in the terminal app.")),
  }),
  Layer.succeed(ClientCapabilities.PrimaryEnvironmentAuth, {
    bearerToken: Effect.succeedNone,
  }),
  Layer.succeed(ClientCapabilities.RelayDeviceIdentity, {
    deviceId: Effect.succeedNone,
  }),
  Layer.succeed(ClientCapabilities.ClientPresentation, {
    metadata: {
      label: "T3 Code TUI",
      deviceType: "desktop",
      os: NodeOS.type(),
      surface: "cli",
      appVersion: packageJson.version,
    },
  }),
  Layer.succeed(ClientCapabilities.SshEnvironmentGateway, {
    provision: sshUnsupported,
    prepare: sshUnsupported,
    disconnect: () => Effect.void,
  }),
  Layer.succeed(PlatformConnectionSource.PlatformConnectionSource, {
    registrations: Stream.empty,
  }),
  Connectivity.layer({ status: Effect.succeed("unknown"), changes: Stream.empty }),
  Wakeups.layer({ changes: Stream.empty }),
);

const layerHttpClient = layerRemoteHttpClient((input, init) => globalThis.fetch(input, init));

const layerRelay = ManagedRelay.layer({
  relayUrl: "http://relay.invalid",
  clientId: RelayWebClientId,
}).pipe(
  Layer.provideMerge(
    Layer.succeed(ManagedRelay.ManagedRelayDpopSigner, {
      thumbprint: relayUnavailable(),
      createProof: relayUnavailable,
    }),
  ),
  Layer.provide(layerHttpClient),
);

const layerStorage = Layer.unwrap(
  resolveConfigDir(process.env).pipe(Effect.map(ConnectionStorage.layer)),
).pipe(Layer.provide(NodeServices.layer));

const layerPlatform = Layer.mergeAll(
  layerCapabilities,
  layerHttpClient,
  layerRelay,
  layerNoEnvironmentCache,
  layerStorage,
  Socket.layerWebSocketConstructorGlobal,
  // Thread commands allocate their command ids with it.
  SecureRandom.layerWebCrypto,
);

const layerSnapshotLoaders = Layer.mergeAll(
  ShellSnapshotLoader.layer,
  BoundedThreadSnapshotLoader.layer,
  ThreadHistoryController.layer,
  PullRequestDiffLoader.layer,
);

const layerConnection = layerSnapshotLoaders.pipe(
  Layer.provideMerge(Connection.layer),
  Layer.provideMerge(layerPlatform),
);

export const appAtomRegistry = AtomRegistry.make();

export const connectionAtomRuntime = Atom.runtime(layerConnection);
