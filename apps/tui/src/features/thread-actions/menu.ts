import {
  resolveCustomSnooze,
  type CustomSnoozeInput,
} from "@t3tools/client-runtime/state/thread-settled";
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export type ThreadAction =
  | "pin"
  | "settle"
  | "snooze"
  | "labels"
  | "rename"
  | "regenerate-title"
  | "mark-unread"
  | "copy-link"
  | "copy-id"
  | "archive"
  | "delete";

export interface MenuItem<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly color?: string;
}

type ThreadState = Pick<
  OrchestrationV2ThreadShell,
  | "pinnedAt"
  | "settledOverride"
  | "snoozedUntil"
  | "archivedAt"
  | "activeRunId"
  | "titleRegeneration"
>;

/** Reading, marking unread and copying stay open to read-only clients, as on web. */
const READ_ONLY_ACTIONS: ReadonlySet<ThreadAction> = new Set([
  "mark-unread",
  "copy-link",
  "copy-id",
]);

export function isSnoozed(thread: ThreadState, now: Date): boolean {
  return thread.snoozedUntil != null && DateTime.toEpochMillis(thread.snoozedUntil) > now.getTime();
}

/** The thread actions menu, in the web menu's order. */
export function threadMenuItems(
  thread: ThreadState,
  options: { readonly canOperate: boolean; readonly hasLabels: boolean; readonly now: Date },
): ReadonlyArray<MenuItem<ThreadAction>> {
  const regenerating = thread.titleRegeneration != null;
  const items: ReadonlyArray<MenuItem<ThreadAction>> = [
    { id: "pin", label: thread.pinnedAt != null ? "Unpin thread" : "Pin thread" },
    {
      id: "settle",
      label: thread.settledOverride === "settled" ? "Un-settle thread" : "Settle thread",
    },
    { id: "snooze", label: isSnoozed(thread, options.now) ? "Wake thread" : "Snooze ›" },
    ...(options.hasLabels ? [{ id: "labels" as const, label: "Labels ›" }] : []),
    { id: "rename", label: "Rename thread" },
    {
      id: "regenerate-title",
      label: regenerating ? "Regenerating…" : "Regenerate title",
      disabled: regenerating,
    },
    { id: "mark-unread", label: "Mark unread" },
    { id: "copy-link", label: "Copy thread link" },
    { id: "copy-id", label: "Copy thread ID" },
    thread.archivedAt != null
      ? { id: "archive", label: "Unarchive thread" }
      : // The server rejects archiving a thread with a provider attached.
        { id: "archive", label: "Archive thread", disabled: thread.activeRunId !== null },
    { id: "delete", label: "Delete thread…" },
  ];
  return options.canOperate
    ? items
    : items.map((item) => (READ_ONLY_ACTIONS.has(item.id) ? item : { ...item, disabled: true }));
}

const DURATION_UNITS = { m: "minutes", h: "hours", d: "days" } as const;

/** `90m`, `2h`, `3d`, or `YYYY-MM-DD HH:MM` (local time) to an ISO wake time; null if invalid or past. */
export function parseCustomSnooze(text: string, now: Date): string | null {
  const value = text.trim();
  const duration = /^(\d+)\s*([mhd])$/i.exec(value);
  const date = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/.exec(value);
  let input: CustomSnoozeInput;
  if (duration) {
    const unit = duration[2]!.toLowerCase() as keyof typeof DURATION_UNITS;
    input = { mode: "duration", amount: duration[1]!, unit: DURATION_UNITS[unit] };
  } else if (date) input = { mode: "date", date: date[1]!, time: date[2]! };
  else return null;
  return resolveCustomSnooze(input, now);
}
