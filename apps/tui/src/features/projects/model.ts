import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import {
  isListedThreadLineage,
  ProjectIconColor,
  type ScopedThreadRef,
  type VcsStatusResult,
} from "@t3tools/contracts";

/** The icon's color, else the color web derives from the title (apps/web/src/projectIdentity.ts). */
export function projectColor(project: Pick<EnvironmentProject, "title" | "projectIcon">) {
  const icon = project.projectIcon;
  if (icon && "color" in icon) return icon.color as ProjectIconColor;
  const seed = project.title.normalize("NFKC").trim().toLocaleLowerCase("en-US") || "project";
  let index = 0;
  for (const glyph of seed) {
    index = (index * 31 + (glyph.codePointAt(0) ?? 0)) % ProjectIconColor.literals.length;
  }
  return ProjectIconColor.literals[index] ?? "blue";
}

export const projectKey = (project: Pick<EnvironmentProject, "environmentId" | "id">) =>
  `${project.environmentId}:${project.id}`;

export type ProjectRow =
  | {
      readonly kind: "project";
      readonly key: string;
      readonly project: EnvironmentProject;
      readonly threadCount: number;
      readonly expanded: boolean;
    }
  | {
      readonly kind: "thread";
      readonly key: string;
      readonly title: string;
      readonly ref: ScopedThreadRef;
    };

/** Pinned projects first (oldest pin first), then by title; an expanded project lists its threads. */
export function buildProjectRows(
  projects: ReadonlyArray<EnvironmentProject>,
  threads: ReadonlyArray<EnvironmentThreadShell>,
  expanded: ReadonlySet<string>,
): ReadonlyArray<ProjectRow> {
  const byProject = new Map<string, EnvironmentThreadShell[]>();
  for (const thread of threads) {
    if (!isListedThreadLineage(thread.lineage)) continue;
    const key = `${thread.environmentId}:${thread.projectId}`;
    byProject.set(key, [...(byProject.get(key) ?? []), thread]);
  }
  const listed = projects
    .filter((project) => !project.isScratch && project.archivedAt == null)
    .toSorted(
      (a, b) =>
        (a.pinnedAt == null ? 1 : 0) - (b.pinnedAt == null ? 1 : 0) ||
        (a.pinnedAt ?? "").localeCompare(b.pinnedAt ?? "") ||
        a.title.localeCompare(b.title),
    );
  return listed.flatMap((project): ProjectRow[] => {
    const key = projectKey(project);
    const projectThreads = byProject.get(key) ?? [];
    const open = expanded.has(key);
    return [
      { kind: "project", key, project, threadCount: projectThreads.length, expanded: open },
      ...(open
        ? projectThreads.map((thread) => ({
            kind: "thread" as const,
            key: `${key}:${thread.id}`,
            title: thread.title || "Untitled thread",
            ref: { environmentId: thread.environmentId, threadId: thread.id },
          }))
        : []),
    ];
  });
}

/** `main ↑1 ↓2 ●3 #12`: branch, ahead, behind, changed files, open pull request. */
export function gitSummary(status: VcsStatusResult | null, branch: string | null): string | null {
  if (status === null) return branch;
  if (!status.isRepo) return "not a git repository";
  return [
    status.refName ?? branch ?? "detached",
    status.aheadCount > 0 ? `↑${status.aheadCount}` : null,
    status.behindCount > 0 ? `↓${status.behindCount}` : null,
    status.workingTree.files.length > 0 ? `●${status.workingTree.files.length}` : null,
    status.pr?.state === "open" ? `#${status.pr.number}` : null,
  ]
    .filter((part) => part !== null)
    .join(" ");
}
