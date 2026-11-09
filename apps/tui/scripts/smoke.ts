// End-to-end smoke test: production server on a playground copy, TUI in a pseudo-terminal.
// Run: vp run --filter @t3tools/tui smoke [--keep]. See README "Smoke test".
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import * as Pty from "node-pty";

const tuiDir = NodePath.resolve(import.meta.dirname, "..");
const serverDir = NodePath.resolve(tuiDir, "../server");
const keep = process.argv.includes("--keep");
const playground = NodePath.resolve(
  process.env.T3_SMOKE_PLAYGROUND ?? NodePath.join(NodeOS.homedir(), "t3-playground"),
);
const sourceDb = NodePath.join(playground, "userdata", "statev2.sqlite");
const COLS = 120;
const ROWS = 32;

function log(message: string) {
  process.stdout.write(`smoke: ${message}\n`);
}

if (playground === NodePath.join(NodeOS.homedir(), ".t3")) {
  throw new Error("Refusing to use live T3 home data. Point T3_SMOKE_PLAYGROUND at a playground.");
}
if (!NodeFS.existsSync(sourceDb)) {
  throw new Error(`No playground database at ${sourceDb}. Set T3_SMOKE_PLAYGROUND.`);
}

const work = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-tui-smoke-"));
const baseDir = NodePath.join(work, "home");
const configDir = NodePath.join(work, "tui");
let server: ReturnType<typeof NodeChildProcess.spawn> | undefined;
let tui: Pty.IPty | undefined;
let tuiOutput = "";

function copyPlayground() {
  const userdata = NodePath.join(baseDir, "userdata");
  NodeFS.mkdirSync(userdata, { recursive: true });
  // `.backup` reads a consistent snapshot even while a server writes the source.
  NodeChildProcess.execFileSync("sqlite3", [
    sourceDb,
    `.backup '${NodePath.join(userdata, "statev2.sqlite")}'`,
  ]);
  for (const name of ["environment-id", "anonymous-id"]) {
    const from = NodePath.join(playground, "userdata", name);
    if (NodeFS.existsSync(from)) NodeFS.copyFileSync(from, NodePath.join(userdata, name));
  }
  const settingsPath = NodePath.join(playground, "userdata", "settings.json");
  const settings = NodeFS.existsSync(settingsPath)
    ? JSON.parse(NodeFS.readFileSync(settingsPath, "utf8"))
    : {};
  for (const instance of Object.values<{ enabled?: boolean }>(settings.providerInstances ?? {})) {
    instance.enabled = false;
  }
  NodeFS.writeFileSync(NodePath.join(userdata, "settings.json"), JSON.stringify(settings));
}

async function freePort(from: number, to: number) {
  for (let port = from; port <= to; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = NodeNet.createServer()
        .once("error", () => resolve(false))
        .listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`No free port in ${from}-${to}.`);
}

function waitFor<T>(label: string, timeoutMs: number, check: () => T | undefined): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = check();
      if (value !== undefined) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${label}.`));
      }
    }, 100);
  });
}

async function startServer() {
  const port = await freePort(5750, 5799);
  let output = "";
  server = NodeChildProcess.spawn(
    process.execPath,
    [
      NodePath.join(serverDir, "dist/bin.mjs"),
      "serve",
      "--base-dir",
      baseDir,
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--no-browser",
    ],
    { env: { ...process.env, T3CODE_NO_BROWSER: "1" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  const logFile = NodeFS.createWriteStream(NodePath.join(work, "server.log"));
  for (const stream of [server.stdout!, server.stderr!]) {
    stream.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      logFile.write(chunk);
    });
  }
  log(`server pid ${server.pid} on port ${port}`);
  return waitFor("the pairing URL", 60_000, () => {
    if (server?.exitCode !== null) throw new Error(`Server exited:\n${output}`);
    return /Pairing URL:\s*(\S+)/.exec(NodeUtil.stripVTControlCharacters(output))?.[1];
  });
}

interface Session {
  readonly term: Pty.IPty;
  readonly output: () => string;
  /** The last frame, as text. Ink redraws the whole screen in each synchronized update. */
  readonly frame: () => string;
  readonly exit: Promise<number>;
}

function startTui(args: ReadonlyArray<string>): Session {
  let output = "";
  const term = Pty.spawn(
    process.execPath,
    [NodePath.join(tuiDir, "dist/bin.mjs"), "--config-dir", configDir, ...args],
    {
      cols: COLS,
      rows: ROWS,
      cwd: work,
      env: { ...process.env, TERM: "xterm-256color", T3CODE_HOME: NodePath.join(work, "none") },
    },
  );
  tui = term;
  term.onData((data) => {
    output += data;
    tuiOutput = output;
  });
  return {
    term,
    output: () => output,
    frame: () =>
      NodeUtil.stripVTControlCharacters(output.slice(output.lastIndexOf("\u001B[?2026h"))),
    exit: new Promise((resolve) => term.onExit(({ exitCode }) => resolve(exitCode))),
  };
}

// Connected, with at least one section header ("▾ Pinned 1") in the sidebar.
const waitForSidebar = (session: Session) =>
  waitFor("the sidebar threads", 30_000, () => {
    const frame = session.frame();
    return frame.includes("Connected") && /[▾▸] \S+ \d+/.test(frame) ? true : undefined;
  });

function expectRestored(output: string, label: string) {
  const lastIndex = (sequence: string) => output.lastIndexOf(`\u001B[${sequence}`);
  if (lastIndex("?1049l") < lastIndex("?1049h") || lastIndex("?1049h") === -1) {
    throw new Error(`${label}: the alternate screen is still on.`);
  }
  if (lastIndex("?25h") < lastIndex("?25l")) throw new Error(`${label}: the cursor is hidden.`);
  if (lastIndex("?2004l") < lastIndex("?2004h")) {
    throw new Error(`${label}: bracketed paste is still on.`);
  }
}

async function main() {
  log("building the server and TUI bundles");
  NodeChildProcess.execFileSync("vp", ["pack"], { cwd: serverDir, stdio: "ignore" });
  NodeChildProcess.execFileSync("vp", ["pack"], { cwd: tuiDir, stdio: "ignore" });
  copyPlayground();
  const pairingUrl = await startServer();

  log("pairing the TUI and opening a thread");
  const first = startTui(["pair", pairingUrl]);
  await waitForSidebar(first);
  first.term.write("j");
  first.term.write("\r");
  // The composer footer shows only under an open thread.
  await waitFor("a loaded thread", 30_000, () => {
    const frame = first.frame();
    return frame.includes("ctrl+l model") && !frame.includes("Loading thread") ? true : undefined;
  });
  NodeFS.writeFileSync(NodePath.join(work, "thread.ansi"), first.output());
  first.term.write("\u0011");
  const firstExit = await first.exit;
  if (firstExit !== 0) throw new Error(`ctrl+q exited with ${firstExit}.`);
  expectRestored(first.output(), "ctrl+q");
  log("ctrl+q quit with code 0 and restored the terminal");

  log("reopening with the saved session, then sending SIGTERM");
  const second = startTui([]);
  await waitForSidebar(second);
  process.kill(second.term.pid, "SIGTERM");
  const secondExit = await second.exit;
  if (secondExit !== 143) throw new Error(`SIGTERM exited with ${secondExit}, not 143.`);
  expectRestored(second.output(), "SIGTERM");
  log("SIGTERM exited with code 143 and restored the terminal");
}

let failed = false;
try {
  await main();
  log("PASS");
} catch (error) {
  failed = true;
  process.stderr.write(`smoke: FAIL ${error instanceof Error ? error.message : String(error)}\n`);
} finally {
  tui?.kill();
  if (server?.pid !== undefined && server.exitCode === null) {
    const exited = new Promise((resolve) => server!.once("exit", resolve));
    process.kill(server.pid, "SIGTERM");
    await exited;
  }
  if (failed) NodeFS.writeFileSync(NodePath.join(work, "tui.ansi"), tuiOutput);
  if (keep || failed) log(`kept ${work}`);
  else NodeFS.rmSync(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
