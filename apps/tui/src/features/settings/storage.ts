import type { StorageCleanupSettings, WorktreeKeepWhen } from "@t3tools/contracts";

export type StorageKey = keyof StorageCleanupSettings;

export interface StorageRow {
  readonly key: StorageKey;
  readonly title: string;
  readonly kind: "toggle" | "days" | "keep";
  /** Smallest day count the server accepts. */
  readonly minDays?: number;
  /** What the change does, shown before the user confirms it. */
  readonly warning: string;
}

/** Web's Storage › Cleanup rows, in the same words. */
export const STORAGE_ROWS: ReadonlyArray<StorageRow> = [
  {
    key: "worktreeOnDelete",
    title: "Delete worktrees with deleted threads",
    kind: "toggle",
    warning:
      "Removes unused worktrees when threads are deleted. Worktrees with local changes are kept.",
  },
  {
    key: "worktreeOnMerge",
    title: "Delete merged worktrees",
    kind: "toggle",
    warning: "Removes worktrees whose pull request is merged into the default branch.",
  },
  {
    key: "worktreeAfterDays",
    title: "Delete inactive worktrees after (days)",
    kind: "days",
    minDays: 1,
    warning:
      "Removes worktrees after their threads are inactive this long. Branches and history stay.",
  },
  {
    key: "worktreeSettledAfterDays",
    title: "Delete settled worktrees after (days)",
    kind: "days",
    minDays: 0,
    warning:
      "Removes worktrees this long after their thread settles. 0 removes them at the next cleanup.",
  },
  {
    key: "worktreeUnchanged",
    title: "Delete unchanged worktrees",
    kind: "toggle",
    warning: "Removes worktrees with no commits beyond the default branch.",
  },
  {
    key: "worktreeKeepWhen",
    title: "Keep worktrees with",
    kind: "keep",
    warning:
      "Cleanup keeps a worktree only when it has these local changes. Other files are deleted.",
  },
  {
    key: "browserArtifactsAfterDays",
    title: "Delete browser artifacts after (days)",
    kind: "days",
    minDays: 1,
    warning: "Deletes saved browser captures after this long. Older capture links stop opening.",
  },
  {
    key: "logsAfterDays",
    title: "Delete logs after (days)",
    kind: "days",
    minDays: 1,
    warning: "Deletes server logs after this long.",
  },
];

const KEEP_WHEN_LABELS: Readonly<Record<WorktreeKeepWhen, string>> = {
  "any-local-files": "Any local files",
  "uncommitted-changes": "Uncommitted changes",
  "tracked-changes": "Edited tracked files",
};

export function nextKeepWhen(value: WorktreeKeepWhen): WorktreeKeepWhen {
  const values = Object.keys(KEEP_WHEN_LABELS) as WorktreeKeepWhen[];
  return values[(values.indexOf(value) + 1) % values.length]!;
}

/** Typed day count: empty turns the rule off (null); undefined when out of range. */
export function parseDays(text: string, minDays: number): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const days = Number(trimmed);
  return days >= minDays && days <= 3650 ? days : undefined;
}

export function formatStorageValue(row: StorageRow, value: unknown): string {
  if (row.kind === "toggle") return value === true ? "on" : "off";
  if (row.kind === "keep") return KEEP_WHEN_LABELS[value as WorktreeKeepWhen];
  return value === null ? "off" : `${value as number}`;
}
