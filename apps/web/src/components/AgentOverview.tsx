import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";

import { cn } from "../lib/utils";
import { useProjects, useQuietThreadShells } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import { formatElapsedDurationLabel, formatRelativeTimeLabel } from "../timestampFormat";
import { ProjectFavicon } from "./ProjectFavicon";
import { ThreadLabelPills } from "./ThreadLabelPills";
import {
  resolveSidebarThreadStatus,
  resolveWorkingStartedAt,
  WORKING_PHASE_PRESENTATION,
} from "./Sidebar.logic";
import { SwitcherPreview } from "./WorkspaceSplits";

const COLUMNS = 4;
const RECENT_LIMIT = 8;

type Shell = ReturnType<typeof useQuietThreadShells>[number];
type Group = "needs" | "working" | "recent";

const NEEDS_LABEL: Record<string, string> = {
  approval: "Needs approval",
  input: "Asked you a question",
  request: "Guest message waiting",
  limited: "Hit a usage limit",
  failed: "Failed",
};

function groupOf(shell: Shell): { group: Group; status: string } {
  const status = resolveSidebarThreadStatus(shell);
  if (status in NEEDS_LABEL) return { group: "needs", status };
  if (status === "working") return { group: "working", status };
  return { group: "recent", status };
}

/**
 * Option+`: every agent at a glance. Threads that need you first, then running ones with a live
 * timer, then the most recent others. Snoozed, settled and archived threads stay out.
 */
export function AgentOverview() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const shells = useQuietThreadShells();
  const projects = useProjects();
  const navigate = useNavigate();

  const nowIso = new Date(now).toISOString();
  const visible = shells.filter(
    (s) =>
      s.archivedAt === null &&
      s.deletedAt === null &&
      s.settledAt === null &&
      !effectiveSnoozed(s, { now: nowIso }),
  );
  const byGroup = (group: Group) =>
    visible
      .map((shell) => ({ shell, ...groupOf(shell) }))
      .filter((entry) => entry.group === group)
      .toSorted((a, b) => Date.parse(b.shell.updatedAt) - Date.parse(a.shell.updatedAt));
  const sections = [
    { group: "needs" as const, title: "Needs you", entries: byGroup("needs") },
    { group: "working" as const, title: "Working", entries: byGroup("working") },
    {
      group: "recent" as const,
      title: "Recent",
      entries: byGroup("recent").slice(0, RECENT_LIMIT),
    },
  ].filter((section) => section.entries.length > 0);
  const flat = sections.flatMap((section) => section.entries);

  const openThread = (ref: ScopedThreadRef) => {
    setOpen(false);
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };
  const refOf = (shell: Shell): ScopedThreadRef => ({
    environmentId: shell.environmentId,
    threadId: shell.id,
  });

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.code === "Backquote" && event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      setIndex(0);
      setOpen((value) => !value);
      return;
    }
    if (!open) return;
    const move = (step: number) => {
      event.preventDefault();
      if (flat.length > 0) setIndex((index + step + flat.length) % flat.length);
    };
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowRight") move(1);
    else if (event.key === "ArrowLeft") move(-1);
    else if (event.key === "ArrowDown") move(COLUMNS);
    else if (event.key === "ArrowUp") move(-COLUMNS);
    else if (event.key === "Enter") {
      event.preventDefault();
      const entry = flat[index];
      if (entry) openThread(refOf(entry.shell));
    } else if (/^[1-9]$/.test(event.key)) {
      const entry = flat[Number(event.key) - 1];
      if (entry) {
        event.preventDefault();
        openThread(refOf(entry.shell));
      }
    }
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window key listener for the Option+` overview toggle, held while mounted
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- one-second clock for the live working timers, only while open
  useEffect(() => {
    if (!open) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [open]);

  if (!open) return null;
  const counts = {
    needs: sections.find((s) => s.group === "needs")?.entries.length ?? 0,
    working: sections.find((s) => s.group === "working")?.entries.length ?? 0,
  };
  let position = -1;
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto scrollbar-gutter-both bg-black/55 backdrop-blur-md"
      onClick={(event) => event.target === event.currentTarget && setOpen(false)}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-12">
        <header className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-foreground">Agents</h2>
          <span className="text-sm text-muted-foreground">
            {counts.needs > 0 ? (
              <span className="text-warning">{counts.needs} need you</span>
            ) : (
              "Nothing needs you"
            )}
            {" · "}
            {counts.working} working
          </span>
          <span className="ml-auto text-3xs text-muted-foreground">
            ← → ↑ ↓ move · Enter or 1–9 open · Esc close
          </span>
        </header>
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active threads.</p>
        ) : null}
        {sections.map((section) => (
          <section key={section.group} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {section.title} · {section.entries.length}
            </h3>
            <div className="grid grid-cols-4 gap-3">
              {section.entries.map(({ shell, status }) => {
                position += 1;
                const i = position;
                const project = projects.find(
                  (p) => p.environmentId === shell.environmentId && p.id === shell.projectId,
                );
                const startedAt =
                  section.group === "working" ? resolveWorkingStartedAt(shell) : null;
                return (
                  <button
                    type="button"
                    key={scopedThreadKey(refOf(shell))}
                    // Move, not enter: a resting pointer must not steal the keyboard selection.
                    onMouseMove={() => setIndex(i)}
                    onClick={() => openThread(refOf(shell))}
                    className={cn(
                      "relative flex h-52 cursor-pointer flex-col gap-2 rounded-2xl liquid-glass p-3 text-left ring-2 transition-colors",
                      i === index ? "ring-primary" : "ring-transparent",
                    )}
                  >
                    {section.group === "needs" ? (
                      <span
                        className={cn(
                          "absolute inset-x-4 top-0 h-0.5 rounded-full",
                          status === "failed" ? "bg-destructive" : "bg-warning",
                        )}
                      />
                    ) : null}
                    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      {project ? (
                        <ProjectFavicon project={project} className="size-4 shrink-0" />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
                        {project && !project.isScratch ? project.title : "No project"}
                      </span>
                      {i < 9 ? (
                        <kbd className="rounded border border-border px-1 font-mono text-3xs">
                          {i + 1}
                        </kbd>
                      ) : null}
                    </span>
                    <span className="line-clamp-2 text-sm leading-snug font-semibold text-foreground">
                      {shell.title}
                    </span>
                    <ThreadLabelPills
                      environmentId={shell.environmentId}
                      tags={shell.tags}
                      max={4}
                      className="-mt-1"
                    />
                    {shell.branch ? (
                      <span className="flex min-w-0 items-center gap-1 font-mono text-3xs text-muted-foreground">
                        <GitBranch className="size-3 shrink-0" />
                        <span className="truncate">{shell.branch}</span>
                      </span>
                    ) : null}
                    <span className="min-h-0 flex-1 overflow-hidden border-t border-border/60 pt-2 text-xs leading-relaxed">
                      <SwitcherPreview threadRef={refOf(shell)} />
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-medium",
                        section.group === "needs"
                          ? status === "failed"
                            ? "text-destructive"
                            : "text-warning"
                          : section.group === "working"
                            ? "text-primary"
                            : "text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          section.group === "needs"
                            ? status === "failed"
                              ? "bg-destructive"
                              : "bg-warning"
                            : section.group === "working"
                              ? "animate-pulse bg-primary"
                              : "bg-muted-foreground/50",
                        )}
                      />
                      {section.group === "needs"
                        ? NEEDS_LABEL[status]
                        : section.group === "working"
                          ? `${shell.workingPhase ? WORKING_PHASE_PRESENTATION[shell.workingPhase].label : "Working"}${startedAt ? ` · ${formatElapsedDurationLabel(startedAt, now)}` : ""}`
                          : `Idle · ${formatRelativeTimeLabel(shell.latestUserMessageAt ?? shell.updatedAt, now)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
