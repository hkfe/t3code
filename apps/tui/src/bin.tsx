import packageJson from "../package.json" with { type: "json" };
import { parseArgs, USAGE } from "./cli.ts";

// Help, version and usage errors answer before the app bundle loads.
const command = parseArgs(process.argv.slice(2));
if (command.kind === "help") process.stdout.write(USAGE);
else if (command.kind === "version") process.stdout.write(`${packageJson.version}\n`);
else if (command.kind === "usage-error") {
  process.stderr.write(`t3-tui: ${command.message}\n\n${USAGE}`);
  process.exitCode = 2;
} else if (!process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write("t3-tui: needs an interactive terminal.\n");
  process.exitCode = 2;
} else {
  const { fail, runTui } = await import("./run.tsx");
  await runTui(command).catch(fail);
}
