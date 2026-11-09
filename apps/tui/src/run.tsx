import * as NodeServices from "@effect/platform-node/NodeServices";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { AsyncResult } from "effect/reactivity";
import { render, type Instance } from "ink";
import * as NodeOS from "node:os";

import { App } from "./app/App.tsx";
import { findLocalServer, RESTORE_TERMINAL, type RunOptions } from "./cli.ts";
import { resolveConfigDir } from "./connection/configDir.ts";
import { readUserKeybindings } from "./connection/keybindingsFile.ts";
import { appAtomRegistry } from "./connection/runtime.ts";
import { features } from "./features/index.ts";
import { connectPairingUrl } from "./state/catalog.ts";
import { serverHintAtom } from "./state/serverHint.ts";
import { themedStdout } from "./theme/output.ts";
import { colorMode, unicode } from "./theme/theme.ts";

let instance: Instance | undefined;

function restoreTerminal() {
  if (instance === undefined) return;
  const current = instance;
  instance = undefined;
  try {
    current.unmount();
  } catch {
    process.stdout.write("\u001B[?1049l");
  }
  try {
    process.stdout.write(RESTORE_TERMINAL);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch {
    // The terminal is gone (SIGHUP); nothing left to restore.
  }
}

export function fail(error: unknown): never {
  restoreTerminal();
  process.stderr.write(`t3-tui: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

/** Pairs if asked, then renders the app until it quits. Loaded after argument parsing. */
export async function runTui(options: RunOptions) {
  if (options.configDir !== null) process.env.T3_TUI_CONFIG_DIR = options.configDir;
  if (options.pairingUrl !== null) {
    const result = await runAtomCommand(
      appAtomRegistry,
      connectPairingUrl,
      { pairingUrl: options.pairingUrl },
      { reportFailure: false },
    );
    if (!AsyncResult.isSuccess(result)) {
      fail(`pairing failed: ${Cause.pretty(result.cause).split("\n")[0] ?? ""}`);
    }
  }
  appAtomRegistry.set(serverHintAtom, options.server ?? findLocalServer(process.env));

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => {
      restoreTerminal();
      process.exit(128 + NodeOS.constants.signals[signal]);
    });
  }
  process.on("uncaughtException", fail);
  process.on("unhandledRejection", fail);

  const userKeybindings = await Effect.runPromise(
    resolveConfigDir(process.env).pipe(
      Effect.flatMap(readUserKeybindings),
      Effect.provide(NodeServices.layer),
    ),
  );
  instance = render(
    <App registry={appAtomRegistry} features={features} userKeybindings={userKeybindings} />,
    {
      alternateScreen: true,
      exitOnCtrlC: false,
      stdout: themedStdout(process.stdout, { unicode, color: colorMode !== "none" }),
    },
  );
  await instance.waitUntilExit();
  restoreTerminal();
  appAtomRegistry.dispose();
  process.exit(0);
}
