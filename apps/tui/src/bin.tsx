import * as NodeServices from "@effect/platform-node/NodeServices";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import * as Effect from "effect/Effect";
import { AsyncResult } from "effect/reactivity";
import { render } from "ink";

import { App } from "./app/App.tsx";
import { resolveConfigDir } from "./connection/configDir.ts";
import { readUserKeybindings } from "./connection/keybindingsFile.ts";
import { appAtomRegistry } from "./connection/runtime.ts";
import { features } from "./features/index.ts";
import { connectPairingUrl } from "./state/catalog.ts";

const USAGE = `Usage: t3-tui [--config-dir <dir>] [pair <pairing-url>]

  pair <url>        Exchange a pairing URL for a saved session, then open the TUI.
  --config-dir      Where sessions and keybindings.json live (default $XDG_CONFIG_HOME/t3-tui or ~/.config/t3-tui).
`;

async function main(argv: ReadonlyArray<string>) {
  const args = [...argv];
  const configDirIndex = args.indexOf("--config-dir");
  if (configDirIndex !== -1) {
    const dir = args[configDirIndex + 1];
    if (!dir) throw new Error(USAGE);
    process.env.T3_TUI_CONFIG_DIR = dir;
    args.splice(configDirIndex, 2);
  }
  if (args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(USAGE);
    return;
  }
  if (args[0] === "pair") {
    const pairingUrl = args[1];
    if (!pairingUrl) throw new Error(USAGE);
    const result = await runAtomCommand(appAtomRegistry, connectPairingUrl, { pairingUrl });
    if (!AsyncResult.isSuccess(result)) process.exit(1);
  } else if (args.length > 0) {
    throw new Error(USAGE);
  }

  const userKeybindings = await Effect.runPromise(
    resolveConfigDir(process.env).pipe(
      Effect.flatMap(readUserKeybindings),
      Effect.provide(NodeServices.layer),
    ),
  );
  const app = (
    <App registry={appAtomRegistry} features={features} userKeybindings={userKeybindings} />
  );
  const instance = render(app, {
    alternateScreen: true,
    exitOnCtrlC: false,
  });
  await instance.waitUntilExit();
  appAtomRegistry.dispose();
  process.exit(0);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
