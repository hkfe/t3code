import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";

import { resolveThreadStatus, type SidebarThreadStatus } from "../sidebar/sidebarModel.ts";

export type OverviewGroup = "needs" | "working" | "recent";

export interface OverviewEntry {
  readonly thread: EnvironmentThreadShell;
  readonly status: SidebarThreadStatus;
}

export interface OverviewSection {
  readonly group: OverviewGroup;
  readonly title: string;
  readonly entries: ReadonlyArray<OverviewEntry>;
}

const RECENT_LIMIT = 8;
const NEEDS = new Set<SidebarThreadStatus>(["approval", "input", "request", "limited", "failed"]);
const TITLES: Record<OverviewGroup, string> = {
  needs: "Needs you",
  working: "Working",
  recent: "Recent",
};

/** Web's AgentOverview groups: needs you, working, then the 8 newest others; quiet threads stay out. */
export function buildOverview(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  now: string,
): ReadonlyArray<OverviewSection> {
  const groups: Record<OverviewGroup, OverviewEntry[]> = { needs: [], working: [], recent: [] };
  const newestFirst = threads
    .filter(
      (thread) =>
        thread.archivedAt === null &&
        thread.deletedAt === null &&
        thread.settledAt === null &&
        !effectiveSnoozed(thread, { now }),
    )
    .toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  for (const thread of newestFirst) {
    const status = resolveThreadStatus(thread);
    const group = NEEDS.has(status) ? "needs" : status === "working" ? "working" : "recent";
    groups[group].push({ thread, status });
  }
  groups.recent = groups.recent.slice(0, RECENT_LIMIT);
  return (Object.keys(TITLES) as OverviewGroup[])
    .map((group) => ({ group, title: TITLES[group], entries: groups[group] }))
    .filter((section) => section.entries.length > 0);
}

/** Card indices (into the flat entry list) per grid row; a section always starts a new row. */
export function gridRows(
  sections: ReadonlyArray<OverviewSection>,
  columns: number,
): ReadonlyArray<ReadonlyArray<number>> {
  const rows: number[][] = [];
  let next = 0;
  for (const section of sections) {
    for (let start = 0; start < section.entries.length; start += columns) {
      const count = Math.min(columns, section.entries.length - start);
      rows.push(Array.from({ length: count }, (_, offset) => next + offset));
      next += count;
    }
  }
  return rows;
}

export type Direction = "left" | "right" | "up" | "down";

/** Left and right walk the flat list; up and down keep the column, clamped to shorter rows. */
export function moveSelection(
  rows: ReadonlyArray<ReadonlyArray<number>>,
  index: number,
  direction: Direction,
): number {
  const total = rows.reduce((sum, row) => sum + row.length, 0);
  if (total === 0) return 0;
  if (direction === "left") return Math.max(0, index - 1);
  if (direction === "right") return Math.min(total - 1, index + 1);
  const rowIndex = rows.findIndex((row) => row.includes(index));
  const target = rows[rowIndex + (direction === "down" ? 1 : -1)];
  if (rowIndex < 0 || target === undefined) return index;
  const column = rows[rowIndex]!.indexOf(index);
  return target[Math.min(column, target.length - 1)]!;
}

/** 1 to 4 columns, each card at least 28 cells wide. */
export function columnsFor(width: number): number {
  return Math.max(1, Math.min(4, Math.floor(width / 28)));
}

/** Markdown to one plain line for a short preview (copied from web's SwitcherPreview). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
