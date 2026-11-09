import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import type { ScopedThreadRef } from "@t3tools/contracts";

export const activityAt = (thread: EnvironmentThreadShell) =>
  thread.latestUserMessageAt ?? thread.updatedAt;

const isRef = (thread: EnvironmentThreadShell, ref: ScopedThreadRef | null) =>
  ref !== null && thread.environmentId === ref.environmentId && thread.id === ref.threadId;

/** The open thread first, then the rest by last activity; snoozed and archived ones only when open. */
export function switcherThreads(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  current: ScopedThreadRef | null,
  now: string,
): ReadonlyArray<EnvironmentThreadShell> {
  const open = threads.find((thread) => isRef(thread, current));
  const rest = threads
    .filter(
      (thread) =>
        thread !== open && thread.archivedAt === null && !effectiveSnoozed(thread, { now }),
    )
    .map((thread) => ({ thread, at: Date.parse(activityAt(thread)) }))
    .sort((a, b) => b.at - a.at)
    .map(({ thread }) => thread);
  return open ? [open, ...rest] : rest;
}

/** New index after an arrow key in a grid of `columns`; stays put at the edges. */
export function moveInGrid(
  index: number,
  count: number,
  columns: number,
  key: "left" | "right" | "up" | "down",
): number {
  const next =
    key === "left"
      ? index - 1
      : key === "right"
        ? index + 1
        : key === "up"
          ? index - columns
          : index + columns;
  // Down from the row above a short last row lands on its last card.
  const lowerRow = Math.floor(index / columns) < Math.floor((count - 1) / columns);
  if (next < 0 || next >= count) return key === "down" && lowerRow ? count - 1 : index;
  return next;
}

interface TurnItemLike {
  readonly item: { readonly type: string; readonly text?: string };
}

/** Author and plain one-line text of the last message with text. */
export function lastMessagePreview(
  items: ReadonlyArray<TurnItemLike>,
): { readonly author: "You" | "Agent"; readonly text: string } | null {
  const last = items.findLast(
    ({ item }) =>
      (item.type === "user_message" || item.type === "assistant_message") &&
      (item.text ?? "").trim() !== "",
  )?.item;
  if (!last) return null;
  return {
    author: last.type === "user_message" ? "You" : "Agent",
    text: plainText((last.text ?? "").slice(0, 400)),
  };
}

// Copied from web's SwitcherPreview (WorkspaceSplits.tsx): markdown to one plain line.
function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
