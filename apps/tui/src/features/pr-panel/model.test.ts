import type {
  EnvironmentId,
  ProjectId,
  PullRequestCheck,
  ThreadPullRequestLink,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { theme } from "../../theme/theme.ts";
import { parseAnsiLog } from "./ansi.ts";
import {
  buildTimeline,
  buildTimelineRows,
  summarizeChecks,
  threadPullRequestTargets,
} from "./model.ts";
import { timelineLines } from "./TimelineTab.tsx";

const env = "env-1" as EnvironmentId;
const projectId = "project-1" as ProjectId;

const check = (
  status: PullRequestCheck["status"],
  url: string | null = null,
): PullRequestCheck => ({
  name: `check-${status}`,
  status,
  description: null,
  url,
});
const many = (count: number, status: PullRequestCheck["status"]) =>
  Array.from({ length: count }, () => check(status));

const link = (
  number: number,
  linkedAt: string,
  source: ThreadPullRequestLink["source"] = "manual",
) =>
  ({
    host: "github.com",
    repository: "acme/app",
    number,
    url: `https://github.com/acme/app/pull/${number}`,
    source,
    linkedAt,
    snapshot: null,
    stack: null,
  }) as ThreadPullRequestLink;

const commit = (oid: string, at: string, headline: string) => ({
  oid,
  committedDate: at,
  messageHeadline: headline,
});

describe("threadPullRequestTargets", () => {
  it("lists visible links newest first, else the legacy link", () => {
    const targets = threadPullRequestTargets(env, {
      projectId,
      pullRequests: [
        link(1, "2026-01-01T00:00:00Z"),
        link(2, "2026-02-01T00:00:00Z"),
        link(3, "2026-03-01T00:00:00Z", "stack-dismissed"),
      ],
    });
    expect(targets.map((target) => target.reference.number)).toEqual([2, 1]);
    expect(targets[0]).toEqual({
      environmentId: env,
      reference: { projectId, host: "github.com", repository: "acme/app", number: 2 },
    });
    const legacy = { projectId, repository: "acme/app", number: 9, url: "https://x/9" };
    expect(
      threadPullRequestTargets(env, { projectId, pullRequests: [], branchPullRequest: legacy }),
    ).toEqual([
      { environmentId: env, reference: { projectId, repository: "acme/app", number: 9 } },
    ]);
  });
});

describe("summarizeChecks", () => {
  it.each([
    [[], "No checks reported"],
    [[...many(21, "success"), ...many(13, "skipped")], "21 passed · 13 skipped"],
    [many(3, "success"), "All checks passed"],
    [[...many(2, "success"), check("failure")], "1 of 3 failing"],
    [[check("success"), check("pending")], "1 of 2 running"],
    [
      [check("action-required", "https://github.com/a/b/actions/runs/12")],
      "1 workflow awaiting approval",
    ],
  ])("%#", (checks, text) => {
    expect(summarizeChecks(checks)).toBe(text);
  });
});

describe("timeline", () => {
  const detail = {
    createdAt: "2026-03-01T09:00:00Z",
    author: { login: "alice", name: null, avatarUrl: null },
    mergedAt: null,
    closedAt: null,
  };
  const activity = {
    commits: [
      commit("a1", "2026-03-01T10:00:00Z", "Add parser"),
      commit("a2", "2026-03-01T10:10:00Z", "Merge branch 'main' into feature"),
      commit("a3", "2026-03-01T10:20:00Z", "Merge branch 'main' into feature"),
      commit("a4", "2026-03-01T10:30:00Z", "Fix tests"),
    ],
    comments: [
      {
        id: "c1",
        kind: "review" as const,
        author: { login: "bob", name: null, avatarUrl: null },
        body: "Looks good",
        createdAt: "2026-03-01T11:00:00Z",
        url: null,
        path: null,
        reviewState: "APPROVED",
      },
    ],
    reviewThreads: [],
  };

  it("collapses commit runs and merges identical sync commits when expanded", () => {
    const events = buildTimeline(detail, activity);
    expect(events.map((event) => event.id)).toEqual(["c1", "a4", "a3", "a2", "a1", "opened"]);
    const collapsed = buildTimelineRows(events, false);
    expect(collapsed.map((row) => row.kind)).toEqual(["day", "event", "commits", "event"]);
    const expanded = buildTimelineRows(events, true);
    expect(expanded.map((row) => row.kind)).toEqual([
      "day",
      "event",
      "event",
      "sync",
      "event",
      "event",
    ]);
    expect(expanded[3]).toMatchObject({ kind: "sync", source: "main" });
    expect(expanded[3]?.kind === "sync" && expanded[3].events).toHaveLength(2);
  });

  it("ends the rail at the last event's marker", () => {
    const events = buildTimeline(detail, {
      ...activity,
      commits: [],
      comments: [{ ...activity.comments[0]!, body: "line one\n\nline two" }],
    });
    // Newest first: the review (with a body) then "opened" last.
    const lines = timelineLines(buildTimelineRows(events, false), 60);
    const rails = lines.map((line) => line[0]?.text);
    expect(rails[0]).toBe("   ");
    expect(rails.at(-1)).toBe("◆  ");
    expect(rails.slice(2, -1).every((rail) => rail === "│  ")).toBe(true);
  });
});

describe("parseAnsiLog", () => {
  it("maps SGR colors to the theme and drops other escapes and controls", () => {
    const [line] = parseAnsiLog(
      "\x1b]0;evil title\x07\x1b[2J\x1b[31;1mFAIL\x1b[0m done\x07\x1b[38;2;1;2;3mrgb",
    );
    expect(line).toEqual([
      { text: "FAIL", color: theme.danger, bold: true },
      { text: " done" },
      { text: "rgb" },
    ]);
  });

  it("carries styles across lines and colors GitHub error lines", () => {
    const lines = parseAnsiLog("\x1b[32mgreen\nstill green\x1b[39m\n##[error]boom");
    expect(lines[1]).toEqual([{ text: "still green", color: theme.success }]);
    expect(lines[2]).toEqual([{ text: "##[error]boom", color: theme.danger }]);
  });
});
