import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { readUserKeybindings } from "./keybindingsFile.ts";

describe("readUserKeybindings", () => {
  it.effect("reads web-format rules, and reports a broken file instead of failing", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-tui-keys-" });

      expect(yield* readUserKeybindings(dir)).toEqual({ rules: [], errors: [] });

      yield* fs.writeFileString(
        `${dir}/keybindings.json`,
        '[{ "key": "ctrl+e", "command": "diff.toggle" }]',
      );
      expect(yield* readUserKeybindings(dir)).toEqual({
        rules: [{ key: "ctrl+e", command: "diff.toggle" }],
        errors: [],
      });

      yield* fs.writeFileString(`${dir}/keybindings.json`, '[{ "key": 1 }');
      const broken = yield* readUserKeybindings(dir);
      expect(broken.rules).toEqual([]);
      expect(broken.errors[0]).toMatch(/^keybindings\.json ignored: /);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
