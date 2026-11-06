import type { PullRequestCheckLog } from "@t3tools/contracts";

const JOB_URL = /^\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/\d+\/job\/(\d+)\/?$/u;
const TIMESTAMP = /^\uFEFF?\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z ?/u;
const STEP_START = "##[group]Run ";

/** Null for anything but an Actions job page on `host`, such as an external app's check. */
export function parseGitHubActionsJobUrl(
  url: string,
  host: string,
): { readonly owner: string; readonly name: string; readonly jobId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== host.toLowerCase()) return null;
  const match = JOB_URL.exec(parsed.pathname);
  if (!match) return null;
  const [, owner = "", name = "", jobId = ""] = match;
  return { owner, name, jobId };
}

/**
 * The failing step when the log reports an error, otherwise its tail, with GitHub's timestamp
 * prefixes and group markers removed.
 */
export function excerptGitHubJobLog(
  raw: string,
  maxLines = 2000,
): NonNullable<PullRequestCheckLog> {
  const lines = raw.split(/\r?\n/u).map((line) => line.replace(TIMESTAMP, ""));
  while (lines.at(-1) === "") lines.pop();
  const firstError = lines.findIndex((line) => line.startsWith("##[error]"));
  let start = 0;
  let end = lines.length;
  if (firstError !== -1) {
    start = Math.max(
      0,
      lines.slice(0, firstError + 1).findLastIndex((line) => line.startsWith(STEP_START)),
    );
    const next = lines
      .slice(firstError + 1)
      .findIndex((line) => line.startsWith(STEP_START) || line === "Post job cleanup.");
    if (next !== -1) end = firstError + 1 + next;
  }
  const truncated = end - start > maxLines;
  if (truncated) start = end - maxLines;
  const text = lines
    .slice(start, end)
    .filter((line) => line !== "##[endgroup]")
    .map((line) => (line.startsWith("##[group]") ? line.slice("##[group]".length) : line))
    .join("\n");
  return { text, failedStep: firstError !== -1, truncated };
}
