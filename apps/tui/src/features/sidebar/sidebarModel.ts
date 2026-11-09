import { scopeProject, type EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { isShownUnderParent } from "@t3tools/client-runtime/state/threads";
import { buildProjectGroups } from "@t3tools/client-runtime/state/project-grouping";
import {
  isThreadWorking,
  sortInboxThreadsByReturn,
  sortWorkingThreadsBySend,
} from "@t3tools/client-runtime/state/thread-inbox";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { threadSearchSubject } from "@t3tools/client-runtime/state/thread-search";
import {
  sortPinnedThreadsByOrderKey,
  sortSettledThreads,
} from "@t3tools/client-runtime/state/thread-sort";
import type { EnvironmentId, OrchestrationProjectShell } from "@t3tools/contracts";
import { foldSearchQuery, rankSearchItems, scoreThreadSearch } from "@t3tools/shared/paletteSearch";

export type SidebarThreadStatus =
  | "approval"
  | "input"
  | "request"
  | "working"
  | "waiting"
  | "failed"
  | "limited"
  | "ready";

export type SectionId =
  | "pinned"
  | "needs"
  | "working"
  | "waiting"
  | "recent"
  | "snoozed"
  | "settled";

const SECTION_TITLES: Record<SectionId, string> = {
  pinned: "Pinned",
  needs: "Needs you",
  working: "Working",
  waiting: "Waiting",
  recent: "Recent",
  snoozed: "Snoozed",
  settled: "Settled",
};

const NEEDS_YOU = new Set<SidebarThreadStatus>([
  "approval",
  "input",
  "request",
  "failed",
  "limited",
]);

export type SidebarRow =
  | {
      readonly kind: "section" | "project";
      readonly key: string;
      readonly title: string;
      readonly count: number;
      readonly collapsed: boolean;
    }
  | {
      readonly kind: "thread";
      readonly key: string;
      readonly thread: EnvironmentThreadShell;
      readonly status: SidebarThreadStatus;
      readonly nested: boolean;
    };

export interface SidebarInput {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly projects: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly projects: ReadonlyArray<OrchestrationProjectShell>;
  }>;
  readonly delegatedUnderParent: ReadonlySet<string>;
  /** Row keys the user opened or closed; others use their default. */
  readonly toggled: ReadonlySet<string>;
  readonly filter: string;
  readonly now: string;
}

// Copied from apps/web/src/components/Sidebar.logic.ts (resolveSidebarThreadStatus); candidate for client-runtime.
function resolveThreadStatus(thread: EnvironmentThreadShell): SidebarThreadStatus {
  if (thread.hasPendingApprovals || thread.pendingSubagentRequest === "approval") return "approval";
  if (thread.hasPendingUserInput || thread.pendingSubagentRequest === "user_input") return "input";
  if ((thread.pendingGuestMessageCount ?? 0) > 0) return "request";
  if (thread.runtime?.status === "running" && thread.blockedOnThreadWait === true) return "waiting";
  if (
    thread.runtime !== null &&
    ["preparing", "queued", "starting", "running", "waiting"].includes(thread.runtime.status)
  ) {
    return "working";
  }
  if (thread.runtime?.status === "idle") return "waiting";
  if (thread.runtime?.status === "failed") {
    return thread.runtime.lastErrorClass === "usage_limit" ? "limited" : "failed";
  }
  return "ready";
}

// Copied from web's resolveSidebarWaitingReason: "N threads" it waits on, else "CI" or "PR".
export function resolveWaitingReason(thread: EnvironmentThreadShell): string | null {
  const threads =
    thread.runtime?.status === "running"
      ? thread.blockedOnThreadWait === true
        ? (thread.threadWaitCount ?? 0)
        : 0
      : thread.pendingBackgroundTasks.filter((task) => task.kind === "subagent").length;
  if (threads > 0) return threads === 1 ? "1 thread" : `${threads} threads`;
  if (thread.runtime?.status !== "idle") return null;
  const watched = thread.pullRequests.filter((link) => link.watch !== undefined);
  if (watched.some((link) => link.snapshot?.checksState === "pending")) return "CI";
  return watched.length > 0 ? "PR" : null;
}

/** A finished run or failure the user has not seen since their last visit. */
export function isUnread(thread: EnvironmentThreadShell, status: SidebarThreadStatus): boolean {
  const completedAt = Date.parse(thread.latestRun?.completedAt ?? "");
  const visitedAt = Date.parse(thread.lastVisitedAt ?? "");
  if (status === "failed") return Number.isNaN(visitedAt) || !(completedAt <= visitedAt);
  // Never-opened threads are not unread: web shows Done only after a first visit.
  if (status !== "ready" || !thread.lastVisitedAt || Number.isNaN(completedAt)) return false;
  return Number.isNaN(visitedAt) || completedAt > visitedAt;
}

/** "now", "5m", "3h", "2d": the web sidebar's relative time, without the suffix. */
export function relativeTime(iso: string, nowMs: number): string {
  const minutes = Math.floor(Math.max(0, nowMs - Date.parse(iso)) / 60_000);
  if (Number.isNaN(minutes)) return "";
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

const threadKey = (thread: EnvironmentThreadShell) => `${thread.environmentId}:${thread.id}`;

function isCollapsed(key: string, toggled: ReadonlySet<string>): boolean {
  const collapsedByDefault = key === "section:snoozed" || key === "section:settled";
  return collapsedByDefault !== toggled.has(key);
}

/**
 * The sidebar as flat rows: sections in web order with Needs you pulled out of Recent,
 * and Recent grouped into project folders. A filter replaces it with ranked matches.
 */
export function buildSidebarRows(input: SidebarInput): ReadonlyArray<SidebarRow> {
  const listed = input.threads.filter(
    (thread) =>
      thread.archivedAt === null &&
      !isShownUnderParent(
        { environmentId: thread.environmentId, threadId: thread.id },
        thread.lineage,
        input.delegatedUnderParent,
      ),
  );
  const projects = input.projects.flatMap(({ environmentId, projects }) =>
    projects.map((project) => scopeProject(environmentId, project)),
  );
  const projectTitle = new Map(projects.map((p) => [`${p.environmentId}:${p.id}`, p.title]));
  const threadRow = (thread: EnvironmentThreadShell, nested = false): SidebarRow => ({
    kind: "thread",
    key: threadKey(thread),
    thread,
    status: resolveThreadStatus(thread),
    nested,
  });

  const query = foldSearchQuery(input.filter);
  if (query.length > 0) {
    const nowMs = Date.parse(input.now);
    return rankSearchItems(listed, (thread, options) =>
      scoreThreadSearch(
        query,
        threadSearchSubject(
          thread,
          projectTitle.get(`${thread.environmentId}:${thread.projectId}`),
        ),
        nowMs,
        { ...options, picks: false },
      ),
    ).map(({ item }) => threadRow(item));
  }

  const buckets: Record<SectionId, EnvironmentThreadShell[]> = {
    pinned: [],
    needs: [],
    working: [],
    waiting: [],
    recent: [],
    snoozed: [],
    settled: [],
  };
  for (const thread of listed) {
    const status = resolveThreadStatus(thread);
    const section: SectionId = effectiveSnoozed(thread, { now: input.now })
      ? "snoozed"
      : thread.settledOverride === "settled"
        ? "settled"
        : thread.pinnedAt != null
          ? "pinned"
          : NEEDS_YOU.has(status)
            ? "needs"
            : isThreadWorking(thread)
              ? status === "waiting"
                ? "waiting"
                : "working"
              : "recent";
    buckets[section].push(thread);
  }
  const sorted: Record<SectionId, ReadonlyArray<EnvironmentThreadShell>> = {
    pinned: sortPinnedThreadsByOrderKey(buckets.pinned),
    needs: sortInboxThreadsByReturn(buckets.needs),
    working: sortWorkingThreadsBySend(buckets.working),
    waiting: sortWorkingThreadsBySend(buckets.waiting),
    recent: sortInboxThreadsByReturn(buckets.recent),
    snoozed: buckets.snoozed.toSorted(
      (a, b) => Date.parse(a.snoozedUntil ?? "") - Date.parse(b.snoozedUntil ?? ""),
    ),
    settled: sortSettledThreads(buckets.settled),
  };

  const rows: SidebarRow[] = [];
  for (const section of Object.keys(SECTION_TITLES) as SectionId[]) {
    const threads = sorted[section];
    if (threads.length === 0) continue;
    const key = `section:${section}`;
    const collapsed = isCollapsed(key, input.toggled);
    rows.push({
      kind: "section",
      key,
      title: SECTION_TITLES[section],
      count: threads.length,
      collapsed,
    });
    if (collapsed) continue;
    if (section !== "recent") {
      for (const thread of threads) rows.push(threadRow(thread));
      continue;
    }
    // Folders follow their newest thread, as the recent list is sorted.
    const groups = buildProjectGroups({
      projects,
      settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
    });
    const groupByProject = new Map(
      groups.flatMap((group) =>
        group.memberProjectRefs.map((ref) => [`${ref.environmentId}:${ref.projectId}`, group]),
      ),
    );
    const folders = new Map<string, { title: string; threads: EnvironmentThreadShell[] }>();
    for (const thread of threads) {
      const group = groupByProject.get(`${thread.environmentId}:${thread.projectId}`);
      const folderKey = `project:${group?.key ?? `${thread.environmentId}:${thread.projectId}`}`;
      const folder = folders.get(folderKey) ?? { title: group?.label ?? "Other", threads: [] };
      folder.threads.push(thread);
      folders.set(folderKey, folder);
    }
    for (const [folderKey, folder] of folders) {
      const folderCollapsed = isCollapsed(folderKey, input.toggled);
      rows.push({
        kind: "project",
        key: folderKey,
        title: folder.title,
        count: folder.threads.length,
        collapsed: folderCollapsed,
      });
      if (!folderCollapsed) for (const thread of folder.threads) rows.push(threadRow(thread, true));
    }
  }
  return rows;
}
