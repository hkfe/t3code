import { AtomRegistry } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import { features } from "../features/index.ts";
import { toastAtom } from "../state/toast.ts";
import { routeAtom } from "../state/ui.ts";
import type { TuiFeature } from "./feature.ts";
import { buildShellRegistry, keyCollisions } from "./registry.ts";

const run = () => undefined;
const testFeature: TuiFeature = {
  id: "test",
  commands: [
    { id: "a", title: "A", run },
    { id: "b", title: "B", run },
  ],
  keybindings: [
    { key: "ctrl+e", command: "a", when: ({ focus }) => focus === "main" },
    { key: "mod+e", command: "b" },
    { key: "ctrl+e", command: "b", when: ({ focus }) => focus === "sidebar" },
  ],
};

describe("keyCollisions", () => {
  it("finds none among the shipped features, with a thread open and a toast showing", () => {
    const registry = AtomRegistry.make();
    registry.set(routeAtom, {
      view: "thread",
      thread: { environmentId: "e", threadId: "t" } as never,
    });
    registry.set(toastAtom, { text: "Done", tone: "success" });
    expect(keyCollisions(buildShellRegistry(features), registry)).toEqual([]);
    registry.dispose();
  });

  it("reports one key for two commands only where both `when`s pass", () => {
    const shell = buildShellRegistry([testFeature]);
    expect(keyCollisions(shell, AtomRegistry.make())).toEqual(["ctrl+e: a hides b"]);
  });
});

describe("user keybindings", () => {
  it("replace the command's defaults, keep its `when`, win ties, and skip bad rules", () => {
    const shell = buildShellRegistry([testFeature], {
      rules: [
        { key: "leader e", command: "a" },
        { key: "ctrl+e", command: "nope" },
        { key: "ctrl+e", command: "b", when: "terminalFocus" },
        { key: "ctrl+shift", command: "b" },
      ],
      errors: ["keybindings.json ignored: bad"],
    });
    expect(shell.keybindings.map(({ key, command, custom }) => [key, command, custom])).toEqual([
      ["leader e", "a", true],
      ["mod+e", "b", undefined],
      ["ctrl+e", "b", undefined],
    ]);
    const context = { overlay: null, registry: AtomRegistry.make() };
    expect(shell.keybindings[0]?.when?.({ ...context, focus: "main" })).toBe(true);
    expect(shell.keybindings[0]?.when?.({ ...context, focus: "panel" })).toBe(false);
    expect(shell.keybindingErrors).toEqual([
      "keybindings.json ignored: bad",
      "keybindings.json rule 2: unknown command nope",
      'keybindings.json rule 3: "when" is not supported in the TUI',
      "keybindings.json rule 4: invalid key ctrl+shift",
    ]);
  });

  it("can move the leader key", () => {
    const shell = buildShellRegistry(features, {
      rules: [{ key: "ctrl+a", command: "core.leader" }],
      errors: [],
    });
    expect(shell.leaderKey).toBe("ctrl+a");
  });
});
