import packageJson from "../package.json" with { type: "json" };
import { findLocalServer, parseArgs, USAGE } from "./cli.ts";
import { probeBackground } from "./theme/background.ts";

// Help, version and usage errors answer before the app bundle loads.
const command = parseArgs(process.argv.slice(2), () => findLocalServer(process.env));
if (command.kind === "help") process.stdout.write(USAGE);
else if (command.kind === "version") process.stdout.write(`${packageJson.version}\n`);
else if (command.kind === "usage-error") {
  process.stderr.write(`t3-tui: ${command.message}\n\n${USAGE}`);
  process.exitCode = 2;
} else if (!process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write("t3-tui: needs an interactive terminal.\n");
  process.exitCode = 2;
} else {
  if (!process.env.T3_TUI_THEME) {
    const background = await probeBackground(process.stdin, process.stdout);
    if (background) process.env.T3_TUI_THEME = background;
  }
  // The theme reads the environment on import, so the app loads after the probe.
  const { fail, runTui } = await import("./run.tsx");
  await runTui(command).catch(fail);
}
