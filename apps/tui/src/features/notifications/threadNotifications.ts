import {
  presentThreadShell,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import {
  isListedThreadLineage,
  type EnvironmentId,
  type OrchestrationV2ThreadShell,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { Toast } from "../../state/toast.ts";

export type ThreadStatus =
  | "approval"
  | "input"
  | "request"
  | "working"
  | "waiting"
  | "failed"
  | "limited"
  | "ready";

/** Same order as the web sidebar and mobile list (`resolveSidebarThreadStatus`). */
export function resolveThreadStatus(thread: EnvironmentThreadShell): ThreadStatus {
  if (thread.hasPendingApprovals || thread.pendingSubagentRequest === "approval") return "approval";
  if (thread.hasPendingUserInput || thread.pendingSubagentRequest === "user_input") return "input";
  if ((thread.pendingGuestMessageCount ?? 0) > 0) return "request";
  if (thread.runtime?.status === "running" && thread.blockedOnThreadWait) return "waiting";
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
  return thread.latestRun?.status === "failed" ? "failed" : "ready";
}

const ATTENTION: ReadonlySet<ThreadStatus> = new Set([
  "approval",
  "input",
  "request",
  "failed",
  "limited",
]);

/** Archived threads, subagents and side chats never count or notify. */
export function isTrackedThread(thread: OrchestrationV2ThreadShell): boolean {
  return thread.archivedAt === null && isListedThreadLineage(thread.lineage);
}

export type ThreadNotificationKind = "input" | "completion";

export interface ThreadNotification {
  readonly ref: ScopedThreadRef;
  readonly kind: ThreadNotificationKind;
  readonly status: ThreadStatus;
  readonly title: string;
  readonly threadTitle: string;
}

function notificationTitle(kind: ThreadNotificationKind, status: ThreadStatus): string {
  if (kind === "completion") return "Thread completed";
  if (status === "approval") return "Approval needed";
  if (status === "limited") return "Usage limit reached";
  if (status === "failed") return "Thread failed";
  if (status === "request") return "Guest request";
  return "Input needed";
}

interface Observation {
  readonly raw: OrchestrationV2ThreadShell;
  readonly status: ThreadStatus;
  readonly threadTitle: string;
  /** Run and status while the thread needs attention, otherwise null. */
  readonly attention: string | null;
  /** When the latest run completed, if the thread is idle after a completed run. */
  readonly completedAt: number | null;
}

function observe(environmentId: EnvironmentId, raw: OrchestrationV2ThreadShell): Observation {
  const thread = presentThreadShell(environmentId, raw);
  const status = resolveThreadStatus(thread);
  const completedAt = Date.parse(thread.latestRun?.completedAt ?? "");
  const settled = status === "ready" && thread.latestRun?.status === "completed";
  return {
    raw,
    status,
    threadTitle: thread.title,
    attention: ATTENTION.has(status) ? `${thread.latestRun?.runId ?? ""}:${status}` : null,
    completedAt: settled && Number.isFinite(completedAt) ? completedAt : null,
  };
}

/**
 * Turns thread shell snapshots into one notification per event, as the web
 * ThreadNotificationCoordinator does. The first snapshot of each environment is the
 * baseline: what was already true before the TUI started never notifies.
 */
export function createThreadNotifier(notify: (notification: ThreadNotification) => void) {
  const environments = new Map<
    EnvironmentId,
    { previous: Map<ThreadId, Observation>; handled: Map<ThreadId, number> }
  >();
  return {
    observe(environmentId: EnvironmentId, threads: ReadonlyArray<OrchestrationV2ThreadShell>) {
      const entry = environments.get(environmentId) ?? { previous: new Map(), handled: new Map() };
      environments.set(environmentId, entry);
      const next = new Map<ThreadId, Observation>();
      for (const raw of threads) {
        if (!isTrackedThread(raw)) continue;
        const prior = entry.previous.get(raw.id);
        if (prior?.raw === raw) {
          next.set(raw.id, prior);
          continue;
        }
        const state = observe(environmentId, raw);
        next.set(raw.id, state);
        const at = state.completedAt;
        const handledAt = entry.handled.get(raw.id) ?? -Infinity;
        // First sightings and stopped runs only record the completion as handled.
        if (!prior || raw.latestRunStopRequested === true) {
          if (at !== null && at > handledAt) entry.handled.set(raw.id, at);
          if (!prior) continue;
        }
        const ref = { environmentId, threadId: raw.id };
        const present = (kind: ThreadNotificationKind) =>
          notify({
            ref,
            kind,
            status: state.status,
            title: notificationTitle(kind, state.status),
            threadTitle: state.threadTitle,
          });
        if (state.attention !== null && state.attention !== prior.attention) {
          present("input");
          continue;
        }
        if (at === null || at <= (entry.handled.get(raw.id) ?? -Infinity)) continue;
        entry.handled.set(raw.id, at);
        present("completion");
      }
      entry.previous = next;
      for (const id of entry.handled.keys()) if (!next.has(id)) entry.handled.delete(id);
    },
    /** Forgets environments that are no longer paired or enabled. */
    retain(environmentIds: ReadonlySet<EnvironmentId>) {
      for (const id of environments.keys()) if (!environmentIds.has(id)) environments.delete(id);
    },
  };
}

export const NotificationSettings = Schema.Struct({
  /** Ring the terminal bell. Off by default: it is loud in most terminals. */
  bell: Schema.optionalKey(Schema.Boolean),
  /** OSC 9 / OSC 777 desktop notifications while the terminal is not focused. */
  desktop: Schema.optionalKey(Schema.Boolean),
  /** The in-app line above the status bar. */
  toast: Schema.optionalKey(Schema.Boolean),
});

export interface ResolvedNotificationSettings {
  readonly bell: boolean;
  readonly desktop: boolean;
  readonly toast: boolean;
}

const decodeSettings = Schema.decodeUnknownOption(Schema.fromJsonString(NotificationSettings));

/** A missing or broken file gives the defaults, so it never blocks startup. */
export function parseNotificationSettings(text: string | null): ResolvedNotificationSettings {
  const parsed = text === null ? undefined : Option.getOrUndefined(decodeSettings(text));
  return {
    bell: parsed?.bell ?? false,
    desktop: parsed?.desktop ?? true,
    toast: parsed?.toast ?? true,
  };
}

export type DesktopProtocol = "osc9" | "osc777";

/** Terminals known to show these as system notifications. Others (and tmux) get none. */
export function detectDesktopProtocol(
  env: Readonly<Record<string, string | undefined>>,
): DesktopProtocol | null {
  if (env.TERM_PROGRAM === "ghostty" || env.TERM_PROGRAM === "WezTerm") return "osc777";
  if (env.TERM_PROGRAM === "iTerm.app" || env.KITTY_WINDOW_ID || env.TERM === "xterm-kitty") {
    return "osc9";
  }
  return null;
}

// Thread titles come from the server: control bytes could end the sequence early.
const plain = (text: string) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");

export function desktopNotificationSequence(
  protocol: DesktopProtocol,
  title: string,
  body: string,
): string {
  if (protocol === "osc9") return `\u001b]9;${plain(`${title}: ${body}`)}\u0007`;
  return `\u001b]777;notify;${plain(title).replaceAll(";", ",")};${plain(body)}\u0007`;
}

export const BELL = "\u0007";
export const FOCUS_REPORTING_ON = "\u001b[?1004h";
export const FOCUS_REPORTING_OFF = "\u001b[?1004l";

export const OPEN_THREAD_KEY = "ctrl+y";

/**
 * What one notification writes to the terminal and shows in app. The thread in view
 * of a focused terminal needs nothing; the desktop one is only for an unfocused terminal.
 */
export function deliverNotification(
  notification: ThreadNotification,
  context: {
    readonly inView: boolean;
    readonly focused: boolean;
    readonly settings: ResolvedNotificationSettings;
    readonly protocol: DesktopProtocol | null;
  },
): { readonly write: string; readonly toast: Toast | null } {
  const { inView, focused, settings, protocol } = context;
  if (inView && focused) return { write: "", toast: null };
  const desktop =
    !focused && settings.desktop && protocol !== null
      ? desktopNotificationSequence(protocol, notification.title, notification.threadTitle)
      : "";
  return {
    write: (settings.bell ? BELL : "") + desktop,
    toast:
      settings.toast && !inView
        ? {
            text: `${notification.title}: ${plain(notification.threadTitle)}`,
            tone:
              notification.kind === "completion"
                ? "success"
                : notification.status === "failed"
                  ? "danger"
                  : "warning",
            hint: `${OPEN_THREAD_KEY} open`,
            thread: notification.ref,
          }
        : null,
  };
}
