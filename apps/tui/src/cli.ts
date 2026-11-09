// @effect-diagnostics nodeBuiltinImport:off - loads before the app bundle; Effect would slow --help.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export const USAGE = `Usage: t3-tui [options]
       t3-tui pair <pairing-url> [options]

Opens the TUI on the saved servers. Without one, it shows where to pair, and names the
desktop app's local server when it runs.

  pair <url>          Exchange a pairing URL for a saved session, then open the TUI.
  --server <url>      Server to pair with: a pairing URL pairs, a plain URL is the one to suggest.
  --config-dir <dir>  Where sessions are saved (default $XDG_CONFIG_HOME/t3-tui or ~/.config/t3-tui).
  -v, --version       Print the version.
  -h, --help          Print this help.

Exit codes: 0 ok, 1 error, 2 bad usage, 128+n after signal n.
`;

export interface RunOptions {
  readonly kind: "run";
  readonly configDir: string | null;
  readonly pairingUrl: string | null;
  readonly server: string | null;
}

type CliCommand =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "usage-error"; readonly message: string }
  | RunOptions;

const isPairingUrl = (url: URL) => new URLSearchParams(url.hash.slice(1)).has("token");

export function parseArgs(argv: ReadonlyArray<string>): CliCommand {
  let configDir: string | null = null;
  let server: string | null = null;
  let pairingUrl: string | null = null;
  const positional: Array<string> = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "-h" || arg === "--help") return { kind: "help" };
    if (arg === "-v" || arg === "--version") return { kind: "version" };
    if (arg === "--config-dir" || arg === "--server") {
      const value = argv[++index];
      if (!value) return { kind: "usage-error", message: `${arg} needs a value.` };
      if (arg === "--config-dir") configDir = value;
      else server = value;
    } else if (arg.startsWith("-")) {
      return { kind: "usage-error", message: `Unknown option ${arg}.` };
    } else {
      positional.push(arg);
    }
  }
  if (positional[0] === "pair") {
    if (positional.length !== 2) return { kind: "usage-error", message: "pair needs one URL." };
    pairingUrl = positional[1]!;
  } else if (positional.length > 0) {
    return { kind: "usage-error", message: `Unknown command ${positional[0]}.` };
  }
  for (const value of [pairingUrl, server]) {
    if (value === null) continue;
    const url = URL.parse(value);
    if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
      return { kind: "usage-error", message: `Not an http(s) URL: ${value}` };
    }
    if (value === server && isPairingUrl(url)) {
      if (pairingUrl !== null) return { kind: "usage-error", message: "Give one pairing URL." };
      pairingUrl = server;
      server = null;
    }
  }
  if (pairingUrl !== null && !isPairingUrl(new URL(pairingUrl))) {
    return { kind: "usage-error", message: "The pairing URL has no #token=..." };
  }
  return { kind: "run", configDir, pairingUrl, server };
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Origin of the desktop app's (or `t3 serve`'s) running server, from the runtime info it
 * writes. Read-only: the file holds no credential, so the user still pairs once.
 */
export function findLocalServer(
  env: Readonly<Record<string, string | undefined>>,
  isAlive: (pid: number) => boolean = isProcessAlive,
): string | null {
  const home = env.T3CODE_HOME?.trim() || NodePath.join(NodeOS.homedir(), ".t3");
  let info: unknown;
  try {
    info = JSON.parse(
      NodeFS.readFileSync(NodePath.join(home, "userdata", "server-runtime.json"), "utf8"),
    );
  } catch {
    return null;
  }
  if (typeof info !== "object" || info === null) return null;
  const { origin, pid } = info as { origin?: unknown; pid?: unknown };
  if (typeof origin !== "string" || typeof pid !== "number" || !isAlive(pid)) return null;
  const url = URL.parse(origin);
  if (url === null || url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) return null;
  return url.origin;
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

// Modes Ink or a feature may leave on: cursor hidden, mouse and focus reporting, bracketed
// paste. Each sequence is a no-op when its mode is already off.
export const RESTORE_TERMINAL =
  "\u001B[?25h\u001B[?1000l\u001B[?1002l\u001B[?1003l\u001B[?1006l\u001B[?1004l\u001B[?2004l";
