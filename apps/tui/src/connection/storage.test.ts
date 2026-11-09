import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { BearerConnectionCredential, CredentialStore } from "@t3tools/client-runtime/connection";
import { Persistence } from "@t3tools/client-runtime/platform";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ConnectionStorage from "./storage.ts";

// Each read builds the layer again, as a new TUI process would.
const withStorage = <A, E, R>(configDir: string, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(ConnectionStorage.layer(configDir)));

describe("TUI connection storage", () => {
  it.effect("keeps a paired session across restarts in a 0600 file", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const configDir = `${yield* fs.makeTempDirectoryScoped({ prefix: "t3-tui-storage-" })}/t3-tui`;

      yield* withStorage(
        configDir,
        CredentialStore.ConnectionCredentialStore.use((store) =>
          store.put("connection-1", new BearerConnectionCredential({ token: "secret" })),
        ),
      );

      const credential = yield* withStorage(
        configDir,
        CredentialStore.ConnectionCredentialStore.use((store) => store.get("connection-1")),
      );
      expect(Option.getOrNull(credential)).toEqual(
        new BearerConnectionCredential({ token: "secret" }),
      );
      const info = yield* fs.stat(`${configDir}/connections.json`);
      expect(info.mode & 0o777).toBe(0o600);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps the sessions another TUI process saved while this one ran", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const configDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-tui-storage-" });
      const a = yield* Layer.build(ConnectionStorage.layer(configDir));
      const b = yield* Layer.build(ConnectionStorage.layer(configDir));
      const store = CredentialStore.ConnectionCredentialStore;
      const credential = (token: string) => new BearerConnectionCredential({ token });

      yield* store.use((s) => s.get("from-a")).pipe(Effect.provide(a));
      yield* store.use((s) => s.put("from-b", credential("b"))).pipe(Effect.provide(b));
      expect(
        Option.getOrNull(yield* store.use((s) => s.get("from-b")).pipe(Effect.provide(a))),
      ).toEqual(credential("b"));
      yield* store.use((s) => s.put("from-a", credential("a"))).pipe(Effect.provide(a));

      const after = yield* withStorage(
        configDir,
        Effect.all([store.use((s) => s.get("from-a")), store.use((s) => s.get("from-b"))]),
      );
      expect(after.map(Option.getOrNull)).toEqual([credential("a"), credential("b")]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("starts empty when the catalog file is corrupt", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const configDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-tui-storage-" });
      yield* fs.writeFileString(`${configDir}/connections.json`, "{not json");

      const targets = yield* withStorage(
        configDir,
        Persistence.ConnectionTargetStore.use((store) => store.list),
      );
      expect(targets).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
