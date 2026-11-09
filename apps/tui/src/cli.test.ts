// @effect-diagnostics nodeBuiltinImport:off - fixture files for a plain synchronous reader.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { findLocalServer, parseArgs, toPairingUrl } from "./cli.ts";

const PAIR = "http://127.0.0.1:3773/pair#token=ABCD";
const run = (fields: Partial<{ configDir: string; pairingUrl: string; server: string }>) => ({
  kind: "run",
  configDir: null,
  pairingUrl: null,
  server: null,
  ...fields,
});

describe("parseArgs", () => {
  it.each([
    [[], run({})],
    [["--help"], { kind: "help" }],
    [["pair", PAIR, "-v"], { kind: "version" }],
    [["pair", PAIR, "--config-dir", "/c"], run({ pairingUrl: PAIR, configDir: "/c" })],
    [["--server", PAIR], run({ pairingUrl: PAIR })],
    [["--server", "http://box:3773"], run({ server: "http://box:3773" })],
  ])("%j", (argv, expected) => {
    expect(parseArgs(argv)).toEqual(expected);
  });

  it.each([
    [["pair"]],
    [["pair", "http://127.0.0.1:3773"]],
    [["pair", PAIR, "--server", PAIR]],
    [["--server", "ftp://box"]],
    [["--config-dir"]],
    [["--nope"]],
    [["serve"]],
  ])("rejects %j", (argv) => {
    expect(parseArgs(argv).kind).toBe("usage-error");
  });
});

describe("findLocalServer", () => {
  const withRuntimeInfo = (info: unknown, isAlive = () => true) => {
    const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-tui-cli-"));
    try {
      NodeFS.mkdirSync(NodePath.join(home, "userdata"));
      NodeFS.writeFileSync(
        NodePath.join(home, "userdata", "server-runtime.json"),
        JSON.stringify(info),
      );
      return findLocalServer({ T3CODE_HOME: home }, isAlive);
    } finally {
      NodeFS.rmSync(home, { recursive: true });
    }
  };

  it("returns the origin of a live loopback server", () => {
    expect(withRuntimeInfo({ pid: 1, origin: "http://127.0.0.1:3773" })).toBe(
      "http://127.0.0.1:3773",
    );
  });

  it.each([
    ["a dead process", { pid: 1, origin: "http://127.0.0.1:3773" }, false],
    ["a non-loopback origin", { pid: 1, origin: "http://10.0.0.2:3773" }, true],
    ["a malformed file", { origin: 3773 }, true],
  ])("ignores %s", (_name, info, alive) => {
    expect(withRuntimeInfo(info, () => alive)).toBeNull();
  });

  it("returns null without runtime info", () => {
    expect(findLocalServer({ T3CODE_HOME: "/nonexistent-t3-home" })).toBeNull();
  });
});

describe("toPairingUrl", () => {
  const server = "http://127.0.0.1:3773";
  it("pairs a desktop link or bare code with the server", () => {
    const want = "http://127.0.0.1:3773/pair#token=DGWNGCVPLT8K";
    expect(toPairingUrl("t3code://app/pair#token=DGWNGCVPLT8K", server)).toBe(want);
    expect(toPairingUrl(" DGWNGCVPLT8K ", server)).toBe(want);
    expect(parseArgs(["pair", "DGWNGCVPLT8K"], () => server)).toMatchObject({ pairingUrl: want });
  });
  it("keeps http links, and input without a server", () => {
    expect(toPairingUrl("https://h/pair#token=a", server)).toBe("https://h/pair#token=a");
    expect(toPairingUrl("ABC", null)).toBe("ABC");
  });
});
