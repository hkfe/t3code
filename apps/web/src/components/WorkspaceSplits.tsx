import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { GitBranch, Maximize2, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ComposerHandleContext } from "../composerHandleContext";
import { useDiffPanelStore } from "../diffPanelStore";
import type { SideChatParentPanel } from "../lib/sideChatPane";
import { resolveStorage } from "../lib/storage";
import { cn } from "../lib/utils";
import { useRightPanelStore } from "../rightPanelStore";
import { useProjects, useQuietThreadShells, useThreadVisibleTurnItems } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import { formatRelativeTimeLabel } from "../timestampFormat";
import ChatView from "./ChatView";
import { BackgroundThreadContext } from "./chat/backgroundThread";
import { ProjectFavicon } from "./ProjectFavicon";
import { resolveSidebarThreadStatus } from "./Sidebar.logic";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

interface WorkspaceState {
  /** Scoped thread keys, most recently viewed first. Feeds the Option+Tab switcher. */
  recent: string[];
  touch: (key: string) => void;
  /** Scoped thread keys shown as split panes beside the route thread, left to right. */
  splits: string[];
  split: (key: string) => void;
  unsplit: (key: string) => void;
  /** Swaps a split pane with the route thread, which takes the pane's place. */
  promote: (key: string, mainKey: string) => void;
}

/** Four panes at most: the route thread and three splits. */
const MAX_SPLITS = 3;

const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      recent: [],
      touch: (key) =>
        set((s) =>
          s.recent[0] === key
            ? s
            : { recent: [key, ...s.recent.filter((k) => k !== key)].slice(0, 20) },
        ),
      splits: [],
      // The oldest split gives way, so a deleted thread's key never blocks a new one.
      split: (key) =>
        set((s) => ({ splits: [...s.splits.filter((k) => k !== key), key].slice(-MAX_SPLITS) })),
      unsplit: (key) => set((s) => ({ splits: s.splits.filter((k) => k !== key) })),
      promote: (key, mainKey) =>
        set((s) => ({
          splits: s.splits.filter((k) => k !== mainKey).map((k) => (k === key ? mainKey : k)),
        })),
    }),
    {
      name: "t3code:workspace-tabs:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
    },
  ),
);

function describeThread(
  key: string,
  shells: ReturnType<typeof useQuietThreadShells>,
  projects: ReturnType<typeof useProjects>,
) {
  const ref = parseScopedThreadKey(key);
  const shell = ref
    ? shells.find((s) => s.environmentId === ref.environmentId && s.id === ref.threadId)
    : undefined;
  if (!ref || !shell) return [];
  const project = projects.find(
    (p) => p.environmentId === shell.environmentId && p.id === shell.projectId,
  );
  const projectName = !project || project.isScratch ? null : project.title;
  const status = resolveSidebarThreadStatus(shell);
  const dot =
    status === "approval" || status === "input" || status === "request" || status === "limited"
      ? { className: "bg-warning", tone: "text-warning", text: "Needs you" }
      : status === "failed"
        ? { className: "bg-destructive", tone: "text-destructive", text: "Failed" }
        : status === "working"
          ? { className: "bg-primary", tone: "text-primary", text: "Working" }
          : null;
  return [
    {
      key,
      ref,
      label: shell.title,
      projectName,
      project: project ?? null,
      dot,
      branch: shell.branch,
      activityAt: shell.latestUserMessageAt ?? shell.updatedAt,
      snoozed: effectiveSnoozed(shell, { now: new Date().toISOString() }),
    },
  ];
}

/** Opens a thread as a split pane beside the current one ("Open to the side" in the thread menu). */
export function openThreadToTheSide(ref: ScopedThreadRef) {
  useWorkspaceStore.getState().split(scopedThreadKey(ref));
}

/** Records the threads the user views and hosts the Option+Tab switcher over them. */
export function ThreadSwitcherHost(props: { activeThreadRef: ScopedThreadRef | null }) {
  const recent = useWorkspaceStore((s) => s.recent);
  const shells = useQuietThreadShells();
  const projects = useProjects();
  const navigate = useNavigate();
  const activeKey = props.activeThreadRef ? scopedThreadKey(props.activeThreadRef) : null;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records each thread the user views, in order, for the Option+Tab switcher
  useEffect(() => {
    if (activeKey) useWorkspaceStore.getState().touch(activeKey);
  }, [activeKey]);

  return (
    <ThreadSwitcher
      threads={recent
        .flatMap((key) => describeThread(key, shells, projects))
        // Snoozed threads stay out of the way; the open thread keeps its first place.
        .filter((thread) => !thread.snoozed || thread.key === activeKey)
        .slice(0, 9)}
      onPick={(ref) =>
        void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) })
      }
    />
  );
}

/**
 * Ghostty-style splits: the route thread's chat column first, then up to three other threads,
 * each a full chat. Panes are side chats to the keyboard (`data-side-chat-pane`): the route
 * thread keeps global shortcuts, the right panel and the terminal drawer.
 */
export function WorkspaceSplitPanes(props: {
  mainRef: ScopedThreadRef | null;
  enabled: boolean;
  children: ReactNode;
}) {
  const splits = useWorkspaceStore((s) => s.splits);
  const shells = useQuietThreadShells();
  const projects = useProjects();
  const navigate = useNavigate();
  const mainKey = props.mainRef ? scopedThreadKey(props.mainRef) : null;
  // A missing shell is a deleted or not yet loaded thread; the route thread is never doubled.
  const panes = props.enabled
    ? splits
        .filter((key) => key !== mainKey)
        .flatMap((key) => describeThread(key, shells, projects))
    : [];
  const count = panes.length + 1;
  const makeMain = (ref: ScopedThreadRef, key: string) => {
    if (mainKey) useWorkspaceStore.getState().promote(key, mainKey);
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };
  const paneClassName = cn(
    "relative flex min-h-0 min-w-0 flex-col bg-background",
    // The focused pane gets an accent line, only once there is more than one.
    count > 1 &&
      "after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:z-20 after:h-0.5 after:bg-primary after:opacity-0 focus-within:after:opacity-100",
  );

  return (
    <div
      className={
        props.enabled
          ? cn(
              "relative grid min-h-0 min-w-0 flex-1 gap-px bg-border",
              count === 3 ? "grid-cols-3" : count === 1 ? "grid-cols-1" : "grid-cols-2",
              count === 4 ? "grid-rows-2" : "grid-rows-1",
            )
          : "contents"
      }
    >
      <div className={props.enabled ? paneClassName : "contents"}>{props.children}</div>
      {panes.map((pane, index) => (
        <SplitPane
          key={pane.key}
          className={paneClassName}
          pane={pane}
          topRight={index === (count === 4 ? 0 : panes.length - 1)}
          onMakeMain={() => makeMain(pane.ref, pane.key)}
        />
      ))}
    </div>
  );
}

function SplitPane(props: {
  className: string;
  pane: SwitcherThread;
  onMakeMain: () => void;
  /** The top-right pane shares its header row with the window's panel buttons. */
  topRight: boolean;
}) {
  const { pane, onMakeMain } = props;
  // Tool diffs and shell commands need the right panel and terminal drawer, which only the
  // route thread shows: the pane's thread takes the route, with its diff ready.
  const panel: SideChatParentPanel = {
    openToolDiff: (target) => {
      useDiffPanelStore.getState().selectToolCall(pane.ref, target);
      useRightPanelStore.getState().open(pane.ref, "diff");
      onMakeMain();
    },
    runShellCommand: () => onMakeMain(),
  };
  return (
    <div data-side-chat-pane className={props.className}>
      <div
        className={cn(
          "flex h-(--workspace-topbar-height) shrink-0 items-center gap-1.5 border-b border-border pl-3 text-xs",
          props.topRight ? "pr-28" : "pr-1",
        )}
      >
        {pane.dot ? (
          <span className={cn("size-1.5 shrink-0 rounded-full", pane.dot.className)} />
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          {pane.label}
          {pane.projectName ? (
            <span className="text-muted-foreground"> · {pane.projectName}</span>
          ) : null}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-xs" aria-label="Make main" onClick={onMakeMain} />
            }
          >
            <Maximize2 />
          </TooltipTrigger>
          <TooltipPopup side="bottom">Make main</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Close split"
                onClick={() => useWorkspaceStore.getState().unsplit(pane.key)}
              />
            }
          >
            <XIcon />
          </TooltipTrigger>
          <TooltipPopup side="bottom">Close split</TooltipPopup>
        </Tooltip>
      </div>
      <BackgroundThreadContext value>
        <ComposerHandleContext value={null}>
          <ChatView
            environmentId={pane.ref.environmentId}
            threadId={pane.ref.threadId}
            routeKind="server"
            embedded={panel}
          />
        </ComposerHandleContext>
      </BackgroundThreadContext>
    </div>
  );
}

type SwitcherThread = ReturnType<typeof describeThread>[number];

/** Option+Tab: hold Option, press Tab (Shift+Tab goes back), release Option to open the thread. */
function ThreadSwitcher(props: {
  threads: SwitcherThread[];
  onPick: (ref: ScopedThreadRef) => void;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const count = props.threads.length;
    if (event.key === "Escape" && index !== null) {
      event.preventDefault();
      setIndex(null);
      return;
    }
    if (event.key !== "Tab" || !event.altKey || event.metaKey || event.ctrlKey || count < 2) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? -1 : 1;
    // The first press selects the previous thread; index 0 is the current one.
    setIndex(((index ?? 0) + step + count) % count);
  });
  const onKeyUp = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Alt" || index === null) return;
    setIndex(null);
    const thread = props.threads[index];
    if (thread && index !== 0) props.onPick(thread.ref);
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window key listeners for the Option+Tab hold-and-release gesture, held while mounted
  useEffect(() => {
    const onBlur = () => setIndex(null);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  if (index === null) return null;
  const pick = (thread: SwitcherThread, i: number) => {
    setIndex(null);
    if (i !== 0) props.onPick(thread.ref);
  };
  // Windows 11 Alt+Tab: a dimmed screen and a frosted row of window cards, the selected one ringed.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
      <div className="flex max-w-[92vw] flex-col items-center gap-3 rounded-2xl border border-border/60 bg-popover/90 p-3 shadow-2xl backdrop-blur-xl">
        <div
          role="listbox"
          aria-label="Recent threads"
          className="flex flex-wrap justify-center gap-2"
        >
          {props.threads.map((thread, i) => {
            const selected = i === index;
            return (
              <button
                type="button"
                key={thread.key}
                role="option"
                aria-selected={selected}
                // Move, not enter: cards that open under a resting pointer must not steal the selection.
                onMouseMove={() => setIndex(i)}
                onClick={() => pick(thread, i)}
                className={cn(
                  "flex h-60 w-64 cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left ring-2 transition-colors",
                  selected
                    ? "border-transparent bg-accent ring-primary"
                    : "border-border/60 bg-background/60 ring-transparent hover:bg-accent/40",
                )}
              >
                <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  {thread.project ? (
                    <ProjectFavicon project={thread.project} className="size-4 shrink-0" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
                    {thread.projectName ?? "No project"}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {i === 0 ? "Current" : formatRelativeTimeLabel(thread.activityAt)}
                  </span>
                </span>
                <span className="line-clamp-2 text-sm leading-snug font-semibold text-foreground">
                  {thread.label}
                </span>
                {thread.branch ? (
                  <span className="flex min-w-0 items-center gap-1 font-mono text-3xs text-muted-foreground">
                    <GitBranch className="size-3 shrink-0" />
                    <span className="truncate">{thread.branch}</span>
                  </span>
                ) : null}
                <span className="min-h-0 flex-1 overflow-hidden border-t border-border/60 pt-2 text-xs leading-relaxed">
                  <SwitcherPreview threadRef={thread.ref} />
                </span>
                {thread.dot ? (
                  <span
                    className={cn("flex items-center gap-1.5 text-xs font-medium", thread.dot.tone)}
                  >
                    <span className={cn("size-1.5 rounded-full", thread.dot.className)} />
                    {thread.dot.text}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <span className="text-3xs text-muted-foreground">
          ⌥ Tab next · ⇧ ⌥ Tab back · Esc cancel · release ⌥ to open
        </span>
      </div>
    </div>
  );
}

/** The thread's last message. The shell list leaves message text out, so this reads the thread detail, only while the switcher is open. */
function SwitcherPreview(props: { threadRef: ScopedThreadRef }) {
  const items = useThreadVisibleTurnItems(props.threadRef);
  const last = items
    .map((entry) => entry.item)
    .findLast(
      (item) =>
        (item.type === "user_message" || item.type === "assistant_message") &&
        item.text.trim() !== "",
    );
  if (!last || (last.type !== "user_message" && last.type !== "assistant_message")) {
    return <span className="text-muted-foreground">No messages yet.</span>;
  }
  return (
    <span className="line-clamp-5 wrap-anywhere text-muted-foreground">
      <span className="font-medium text-foreground/80">
        {last.type === "user_message" ? "You: " : "Agent: "}
      </span>
      {plainText(last.text.slice(0, 600))}
    </span>
  );
}

/** Markdown to one plain line for a short preview: no `**`, backticks, headings or link targets. */
function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
