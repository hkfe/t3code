import {
  ConnectionCatalogDocument,
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
} from "@t3tools/client-runtime/platform";
import { ConnectionTransientError } from "@t3tools/client-runtime/connection";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

const CatalogJson = Schema.fromJsonString(ConnectionCatalogDocument);
const decodeCatalog = Schema.decodeEffect(CatalogJson);
const encodeCatalog = Schema.encodeEffect(CatalogJson);

function catalogError(operation: string, cause: unknown) {
  return new ConnectionTransientError({
    reason: "remote-unavailable",
    detail: `Could not ${operation} the TUI connection catalog: ${String(cause)}`,
  });
}

/** One JSON document with targets, profiles and bearer credentials, written 0600. */
export const makeCatalogFile = Effect.fn("tui.catalogFile.make")(function* (configDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = (yield* Path.Path).join(configDir, "connections.json");
  const lock = yield* Semaphore.make(1);
  let cached: ConnectionCatalogDocument | undefined;

  const load = Effect.fn("tui.catalogFile.load")(function* () {
    if (cached !== undefined) return cached;
    const exists = yield* fs.exists(path).pipe(Effect.mapError((e) => catalogError("read", e)));
    const raw = exists
      ? yield* fs.readFileString(path).pipe(Effect.mapError((e) => catalogError("read", e)))
      : "";
    cached =
      raw.trim() === ""
        ? EMPTY_CONNECTION_CATALOG_DOCUMENT
        : yield* decodeCatalog(raw).pipe(
            Effect.catch((error) =>
              Effect.logWarning("Discarding corrupt TUI connection catalog", error).pipe(
                Effect.as(EMPTY_CONNECTION_CATALOG_DOCUMENT),
              ),
            ),
          );
    return cached;
  });

  const write = Effect.fn("tui.catalogFile.write")(function* (document: ConnectionCatalogDocument) {
    const encoded = yield* encodeCatalog(document).pipe(
      Effect.mapError((e) => catalogError("encode", e)),
    );
    const temporary = `${path}.tmp`;
    yield* fs.makeDirectory(configDir, { recursive: true, mode: 0o700 }).pipe(
      Effect.andThen(fs.writeFileString(temporary, encoded, { mode: 0o600 })),
      Effect.andThen(fs.rename(temporary, path)),
      Effect.mapError((e) => catalogError("write", e)),
    );
    cached = document;
  });

  return {
    read: lock.withPermits(1)(load()),
    update: (transform: (catalog: ConnectionCatalogDocument) => ConnectionCatalogDocument) =>
      lock.withPermits(1)(load().pipe(Effect.map(transform), Effect.flatMap(write))),
  };
});
