import type { Background } from "./theme.ts";

// Long enough for a slow SSH link: a late reply would reach Ink as key presses.
const PROBE_TIMEOUT_MS = 1000;

/** An OSC 11 reply (`11;rgb:RRRR/GGGG/BBBB`) as dark or light; null when there is none. */
export function parseBackgroundReply(reply: string): Background | null {
  const match = /\]11;rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i.exec(reply);
  if (!match) return null;
  const [r, g, b] = match.slice(1).map((hex) => parseInt(hex, 16) / (16 ** hex.length - 1));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.5 ? "light" : "dark";
}

/**
 * Asks the terminal for its background color. Every terminal answers the DA1 query sent after it,
 * so one that ignores OSC 11 ends the wait at once; the timeout covers ones that answer neither.
 */
export function probeBackground(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
): Promise<Background | null> {
  if (!stdin.isTTY || !stdout.isTTY) return Promise.resolve(null);
  return new Promise((resolve) => {
    let reply = "";
    const done = () => {
      clearTimeout(timer);
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      resolve(parseBackgroundReply(reply));
    };
    const onData = (chunk: Buffer) => {
      reply += chunk.toString();
      if (/\u001b\[\?[\d;]*c/.test(reply)) done();
    };
    const timer = setTimeout(done, PROBE_TIMEOUT_MS);
    stdin.setRawMode(true);
    stdin.on("data", onData);
    stdin.resume();
    stdout.write("\u001b]11;?\u001b\\\u001b[c");
  });
}
