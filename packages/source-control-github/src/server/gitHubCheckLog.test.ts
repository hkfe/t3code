import { expect, it } from "vite-plus/test";

import { excerptGitHubJobLog, parseGitHubActionsJobUrl } from "./gitHubCheckLog.ts";

it("reads the job from an Actions job URL on the pull request's host only", () => {
  expect(
    parseGitHubActionsJobUrl(
      "https://github.com/acme/web.app/actions/runs/12/job/345",
      "github.com",
    ),
  ).toEqual({ owner: "acme", name: "web.app", jobId: "345" });
  expect(
    parseGitHubActionsJobUrl(
      "https://github.com/acme/web/actions/runs/12/job/345?pr=7",
      "GitHub.com",
    ),
  ).toEqual({ owner: "acme", name: "web", jobId: "345" });
  for (const url of [
    "https://github.com/acme/web/actions/runs/12",
    "https://app.circleci.com/pipelines/github/acme/web/1",
    "https://ghe.example.com/acme/web/actions/runs/12/job/345",
    "not a url",
  ]) {
    expect(parseGitHubActionsJobUrl(url, "github.com")).toBeNull();
  }
});

const log = [
  "﻿2026-11-05T10:00:00.0000000Z ##[group]Run actions/checkout@v4",
  "2026-11-05T10:00:01.0000000Z checked out",
  "2026-11-05T10:00:01.1000000Z ##[endgroup]",
  "2026-11-05T10:00:02.0000000Z ##[group]Run vp test",
  "2026-11-05T10:00:03.0000000Z FAIL src/a.test.ts",
  "2026-11-05T10:00:04.0000000Z ##[error]Process completed with exit code 1.",
  "2026-11-05T10:00:05.0000000Z Post job cleanup.",
  "2026-11-05T10:00:06.0000000Z cleaned",
  "",
].join("\n");

it("keeps only the failing step, without timestamps or group markers", () => {
  expect(excerptGitHubJobLog(log)).toEqual({
    text: "Run vp test\nFAIL src/a.test.ts\n##[error]Process completed with exit code 1.",
    failedStep: true,
    truncated: false,
  });
});

it("keeps the end of a failing step longer than the cap", () => {
  expect(excerptGitHubJobLog(log, 2)).toEqual({
    text: "FAIL src/a.test.ts\n##[error]Process completed with exit code 1.",
    failedStep: true,
    truncated: true,
  });
});

it("shows the tail of a log with no error", () => {
  expect(excerptGitHubJobLog("2026-11-05T10:00:00Z one\ntwo\nthree\n", 2)).toEqual({
    text: "two\nthree",
    failedStep: false,
    truncated: true,
  });
});
