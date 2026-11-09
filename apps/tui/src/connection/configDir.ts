import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as NodeOS from "node:os";

/** Session tokens live here, never in T3 home: `$T3_TUI_CONFIG_DIR`, else `$XDG_CONFIG_HOME/t3-tui`. */
export const resolveConfigDir = Effect.fn("tui.resolveConfigDir")(function* (
  env: Readonly<Record<string, string | undefined>>,
) {
  const path = yield* Path.Path;
  const explicit = env.T3_TUI_CONFIG_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const xdg = env.XDG_CONFIG_HOME?.trim();
  return path.join(xdg ? path.resolve(xdg) : path.join(NodeOS.homedir(), ".config"), "t3-tui");
});
