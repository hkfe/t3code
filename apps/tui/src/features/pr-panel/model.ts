// Trimmed copies of apps/web/src/components/pullRequest/pullRequestDetail.logic.ts and
// pullRequestPresentation.tsx (the web file imports web-only modules); candidates for client-runtime.
import { visibleThreadPullRequests } from "@t3tools/client-runtime/thread-pull-requests";
import type {
  EnvironmentId,
  ProjectId,
  PullRequestActivity,
  PullRequestActor,
  PullRequestCheck,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetail,
  ThreadLinkedPullRequest,
  ThreadPullRequestLink,
} from "@t3tools/contracts";

import type { PullRequestTarget } from "../../app/feature.ts";

interface ThreadPullRequests {
  readonly projectId: ProjectId;
  readonly pullRequests?: ReadonlyArray<ThreadPullRequestLink> | undefined;
  readonly linkedPullRequest?: ThreadLinkedPullRequest | null | undefined;
  readonly branchPullRequest?: ThreadLinkedPullRequest | null | undefined;
}

/** The thread's linked pull requests, newest link first; the legacy single link otherwise. */
export function threadPullRequestTargets(
  environmentId: EnvironmentId,
  thread: ThreadPullRequests,
): PullRequestTarget[] {
  const { projectId } = thread;
  const links = visibleThreadPullRequests(thread.pullRequests ?? []).toSorted(
    (left, right) => Date.parse(right.linkedAt) - Date.parse(left.linkedAt),
  );
  if (links.length > 0) {
    return links.map((link) => ({
      environmentId,
      reference: { projectId, host: link.host, repository: link.repository, number: link.number },
    }));
  }
  const legacy = thread.linkedPullRequest ?? thread.branchPullRequest ?? null;
  return legacy === null
    ? []
    : [
        {
          environmentId,
          reference: {
            projectId: legacy.projectId,
            repository: legacy.repository,
            number: legacy.number,
          },
        },
      ];
}

export function targetKey({ environmentId, reference }: PullRequestTarget): string {
  return `${environmentId}:${reference.host ?? ""}:${reference.repository}#${reference.number}`;
}

const isFailing = (check: PullRequestCheck) =>
  check.status === "failure" || check.status === "cancelled";

function isWorkflowApprovalCheck(check: Pick<PullRequestCheck, "status" | "url">): boolean {
  return (
    check.status === "action-required" &&
    check.url !== null &&
    /\/actions\/runs\/\d+(?:\/|$)/u.test(check.url)
  );
}

export function groupChecks(checks: ReadonlyArray<PullRequestCheck>) {
  return {
    attention: checks.filter((check) =>
      ["failure", "cancelled", "action-required"].includes(check.status),
    ),
    running: checks.filter((check) => check.status === "pending"),
    completed: checks.filter((check) => ["success", "skipped", "neutral"].includes(check.status)),
  };
}

export type ChecksState = "passing" | "failing" | "pending";

export function checksState(checks: ReadonlyArray<PullRequestCheck>): ChecksState | null {
  if (checks.length === 0) return null;
  if (checks.some(isFailing)) return "failing";
  if (checks.some((check) => check.status === "pending" || check.status === "action-required"))
    return "pending";
  return checks.some((check) => check.status === "success") ? "passing" : null;
}

export function summarizeChecks(checks: ReadonlyArray<PullRequestCheck>): string {
  if (checks.length === 0) return "No checks reported";
  const actionRequired = checks.filter((check) => check.status === "action-required");
  const approvals = actionRequired.filter(isWorkflowApprovalCheck).length;
  const otherActions = actionRequired.length - approvals;
  const failed = checks.filter(isFailing).length;
  const pending = checks.filter((check) => check.status === "pending").length;
  const passed = checks.filter((check) => check.status === "success").length;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  if (failed > 0) return `${failed} of ${checks.length} failing`;
  if (approvals > 0 && otherActions > 0)
    return `${plural(approvals, "workflow")} and ${plural(otherActions, "check")} awaiting action`;
  if (approvals > 0) return `${plural(approvals, "workflow")} awaiting approval`;
  if (otherActions > 0) return `${plural(otherActions, "check")} awaiting action`;
  if (pending > 0) return `${pending} of ${checks.length} running`;
  return passed === checks.length
    ? "All checks passed"
    : `${passed} passed · ${checks.length - passed} skipped`;
}

const CHECK_LABEL: Record<PullRequestCheck["status"], string> = {
  pending: "Running",
  "action-required": "Awaiting action",
  success: "Passed",
  failure: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
  neutral: "Neutral",
};

export function checkStatusLabel(check: Pick<PullRequestCheck, "status" | "url">): string {
  return isWorkflowApprovalCheck(check) ? "Awaiting approval" : CHECK_LABEL[check.status];
}

export function checkDuration(
  check: Pick<PullRequestCheck, "startedAt" | "completedAt">,
): string | null {
  if (!check.startedAt || !check.completedAt) return null;
  const seconds = Math.round((Date.parse(check.completedAt) - Date.parse(check.startedAt)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export type ReviewOutcome = "approved" | "changes-requested" | "dismissed";

function reviewOutcome(reviewState: string | null): ReviewOutcome | null {
  const state = reviewState?.trim().toLowerCase().replaceAll("_", "-");
  return state === "approved" || state === "changes-requested" || state === "dismissed"
    ? state
    : null;
}

/** Each reviewer with the verdict of their latest review, if any. */
export function reviewerVerdicts(
  reviewers: ReadonlyArray<PullRequestActor>,
  comments: ReadonlyArray<PullRequestComment>,
): ReadonlyArray<{ readonly login: string; readonly outcome: ReviewOutcome | null }> {
  const latest = new Map<string, ReviewOutcome>();
  for (const comment of comments.toSorted(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  )) {
    const outcome = reviewOutcome(comment.reviewState);
    if (comment.kind === "review" && outcome !== null && comment.author)
      latest.set(comment.author.login.toLowerCase(), outcome);
  }
  const logins = new Map(reviewers.map((actor) => [actor.login.toLowerCase(), actor.login]));
  for (const comment of comments)
    if (comment.author && latest.has(comment.author.login.toLowerCase()))
      logins.set(comment.author.login.toLowerCase(), comment.author.login);
  return [...logins].map(([key, login]) => ({ login, outcome: latest.get(key) ?? null }));
}

/** Drops HTML comments (bot bookkeeping a terminal cannot hide); empty bodies read as null. */
export function visibleBody(body: string): string | null {
  const text = body.replace(/<!--[\s\S]*?-->/gu, "").trim();
  return text === "" ? null : text;
}

export interface TimelineEvent {
  readonly id: string;
  readonly at: string;
  readonly kind: "opened" | "commit" | "comment" | "review" | "thread" | "merged" | "closed";
  readonly actor: string | null;
  readonly body: string | null;
  readonly commit?: PullRequestCommit;
  readonly outcome?: ReviewOutcome | null;
  /** Review threads: `path:line` and the reply count. */
  readonly path?: string;
  readonly replies?: number;
}

/** Newest first, like web. Review thread comments fold into one event per thread. */
export function buildTimeline(
  detail: Pick<PullRequestDetail, "createdAt" | "author" | "mergedAt" | "closedAt">,
  activity: Pick<PullRequestActivity, "commits" | "comments" | "reviewThreads"> | null,
): ReadonlyArray<TimelineEvent> {
  const claimed = new Set(
    activity?.reviewThreads.flatMap((thread) => thread.comments.map((comment) => comment.id)) ?? [],
  );
  const events: TimelineEvent[] = [
    {
      id: "opened",
      at: detail.createdAt,
      kind: "opened",
      actor: detail.author?.login ?? null,
      body: null,
    },
    ...(activity?.commits ?? []).map((commit) => ({
      id: commit.oid,
      at: commit.committedDate,
      kind: "commit" as const,
      actor: commit.authors?.[0]?.login ?? null,
      body: commit.messageHeadline || null,
      commit,
    })),
    ...(activity?.comments ?? [])
      .filter((comment) => !claimed.has(comment.id))
      .map((comment) => ({
        id: comment.id,
        at: comment.createdAt,
        kind: comment.kind === "review" ? ("review" as const) : ("comment" as const),
        actor: comment.author?.login ?? null,
        body: visibleBody(comment.body),
        outcome: reviewOutcome(comment.reviewState),
      })),
    ...(activity?.reviewThreads ?? []).flatMap((thread) => {
      const [root, ...rest] = thread.comments.toSorted(
        (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
      );
      if (root === undefined) return [];
      return [
        {
          id: thread.id,
          at: root.createdAt,
          kind: "thread" as const,
          actor: root.author?.login ?? null,
          body: visibleBody(root.body),
          path: thread.line === null ? thread.path : `${thread.path}:${thread.line}`,
          replies: Math.max(rest.length, (thread.commentCount ?? 0) - 1),
        },
      ];
    }),
    ...(detail.mergedAt
      ? [{ id: "merged", at: detail.mergedAt, kind: "merged" as const, actor: null, body: null }]
      : []),
    ...(detail.closedAt && !detail.mergedAt
      ? [{ id: "closed", at: detail.closedAt, kind: "closed" as const, actor: null, body: null }]
      : []),
  ];
  return events.toSorted((left, right) => (Date.parse(right.at) || 0) - (Date.parse(left.at) || 0));
}

const SYNC_COMMIT_PATTERN = /^Merge (?:remote-tracking )?branch '([^']+)'(?: of \S+)? into /u;
const COMMIT_RUN_COLLAPSE_LENGTH = 3;

/** The branch a "Merge branch 'main' into ..." commit pulled in, or null for other events. */
function syncCommitSource(event: TimelineEvent): string | null {
  return event.kind === "commit" ? (SYNC_COMMIT_PATTERN.exec(event.body ?? "")?.[1] ?? null) : null;
}

export type TimelineRow =
  | { readonly kind: "day"; readonly at: string }
  | { readonly kind: "event"; readonly event: TimelineEvent }
  | {
      readonly kind: "sync";
      readonly source: string;
      readonly events: ReadonlyArray<TimelineEvent>;
    }
  | { readonly kind: "commits"; readonly events: ReadonlyArray<TimelineEvent> };

function localDayKey(at: string): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Splits events into local days, folds runs of 3+ commits into one row unless `expanded`, and
 * merges back-to-back identical sync commits.
 */
export function buildTimelineRows(
  events: ReadonlyArray<TimelineEvent>,
  expanded: boolean,
): ReadonlyArray<TimelineRow> {
  const rows: TimelineRow[] = [];
  let day: string | null = null;
  let run: TimelineEvent[] = [];
  const flushRun = () => {
    if (run.length >= COMMIT_RUN_COLLAPSE_LENGTH && !expanded)
      rows.push({ kind: "commits", events: run });
    else
      for (const event of run) {
        const source = syncCommitSource(event);
        const last = rows.at(-1);
        if (source === null) rows.push({ kind: "event", event });
        else if (last?.kind === "sync" && last.events[0]?.body === event.body)
          rows[rows.length - 1] = { ...last, events: [...last.events, event] };
        else rows.push({ kind: "sync", source, events: [event] });
      }
    run = [];
  };
  for (const event of events) {
    const key = localDayKey(event.at);
    if (key !== day) {
      flushRun();
      day = key;
      rows.push({ kind: "day", at: event.at });
    }
    if (event.kind === "commit") run.push(event);
    else {
      flushRun();
      rows.push({ kind: "event", event });
    }
  }
  flushRun();
  return rows;
}

export function timelineDayLabel(at: string, now: Date = new Date()): string {
  const date = new Date(at);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (localDayKey(at) === localDayKey(now.toISOString())) return "Today";
  if (localDayKey(at) === localDayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
