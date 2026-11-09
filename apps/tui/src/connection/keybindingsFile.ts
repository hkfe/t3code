import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { UserKeybindings } from "../app/registry.ts";

const UserKeybindingsJson = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      key: Schema.String,
      command: Schema.String,
      when: Schema.optional(Schema.String),
    }),
  ),
);

/**
 * `keybindings.json` in the TUI config dir: web's format (`[{ "key", "command" }]`). The registry
 * checks each rule; a missing file is no rules, an unreadable one an error for the status bar.
 */
export const readUserKeybindings = Effect.fn("tui.readUserKeybindings")(function* (
  configDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = (yield* Path.Path).join(configDir, "keybindings.json");
  return yield* fs.exists(path).pipe(
    Effect.flatMap((exists) =>
      exists
        ? fs.readFileString(path).pipe(Effect.flatMap(Schema.decodeEffect(UserKeybindingsJson)))
        : Effect.succeed([]),
    ),
    Effect.map((rules): UserKeybindings => ({ rules, errors: [] })),
    Effect.catch((error) =>
      Effect.succeed<UserKeybindings>({
        rules: [],
        errors: [`keybindings.json ignored: ${error.message.split("\n")[0]}`],
      }),
    ),
  );
});
