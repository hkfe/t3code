// @effect-diagnostics nodeBuiltinImport:off - $EDITOR needs a synchronous child that owns the terminal.
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { runAtomCommand, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef, VcsStatusResult } from "@t3tools/contracts";
import { buildTemporaryWorktreeBranchName, sanitizeBranchFragment } from "@t3tools/shared/git";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Atom, AsyncResult } from "effect/reactivity";
import { Box, Text, useApp, usePaste } from "ink";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import { useContext, useState } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { environmentProjects, vcsEnvironment } from "../../state/projects.ts";
import { environmentShell } from "../../state/shell.ts";
import { threadEnvironment } from "../../state/threadCommands.ts";
import { routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { copyToClipboard, findThreadShell, runCommand } from "../thread-actions/actions.ts";
import { editText, TextField } from "../thread-actions/ui.tsx";
import { gitSummary } from "./model.ts";

const noStatus = Atom.make(AsyncResult.initial<VcsStatusResult>());
const random = SecureRandom.make((size) => globalThis.crypto.getRandomValues(new Uint8Array(size)));
const randomHex = (size: number) =>
  Buffer.from(Effect.runSync(random.randomBytes(size))).toString("hex");
const noProject = Atom.make(null);
const quiet = { warn() {}, error() {} };

/** The thread's shell, its project and git status of its cwd (worktree, else the project root). */
function useWorkspace(ref: ScopedThreadRef) {
  const snapshot = useAtomValue(environmentShell.stateValueAtom(ref.environmentId)).snapshot;
  const thread = findThreadShell(snapshot, ref.threadId);
  const project = useAtomValue(
    thread
      ? environmentProjects.projectAtom({
          environmentId: ref.environmentId,
          projectId: thread.projectId,
        })
      : noProject,
  );
  const cwd = thread?.worktreePath ?? project?.workspaceRoot ?? null;
  const result = useAtomValue(
    cwd !== null
      ? vcsEnvironment.status({ environmentId: ref.environmentId, input: { cwd } })
      : noStatus,
  );
  return {
    thread,
    project,
    cwd,
    status: Option.getOrNull(AsyncResult.value(result)),
    failed: AsyncResult.isFailure(result),
  };
}

/** Status bar: `⎇ main ↑1 ●3 #12` for the thread in the focused pane. */
export function GitStatusItem() {
  const thread = useAtomValue(routeAtom).thread;
  return thread === null ? null : <GitStatus key={thread.threadId} threadRef={thread} />;
}

function GitStatus({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const { thread, status } = useWorkspace(threadRef);
  const summary = thread ? gitSummary(status, thread.branch) : null;
  if (summary === null) return null;
  return (
    <Text color={theme.textMuted} wrap="truncate">
      ⎇ {summary}
    </Text>
  );
}

/** Hands the terminal to `$VISUAL` / `$EDITOR` on the path; the TUI redraws after it exits. */
function useOpenInEditor() {
  const { suspendTerminal } = useApp();
  return (path: string): string | null => {
    const editor = process.env.VISUAL || process.env.EDITOR;
    if (!editor) return "Set $EDITOR to open the path.";
    // A remote server's path does not exist here.
    if (!NodeFS.existsSync(path)) return "This path is not on this machine.";
    void suspendTerminal(() => {
      // A shell runs `$EDITOR` as typed (`code --wait`); the path is quoted for it.
      const quoted = `'${path.replaceAll("'", `'\\''`)}'`;
      NodeChildProcess.spawnSync(`${editor} ${quoted}`, { stdio: "inherit", shell: true });
    });
    return null;
  };
}

export function WorkspacePanel(props: TuiViewProps) {
  const thread = useAtomValue(routeAtom).thread;
  if (thread === null) {
    return <Text color={theme.textFaint}>Open a thread to see its workspace.</Text>;
  }
  return <Workspace key={thread.threadId} {...props} threadRef={thread} />;
}

function Workspace({
  focused,
  width,
  threadRef: ref,
}: TuiViewProps & { readonly threadRef: ScopedThreadRef }) {
  const registry = useContext(RegistryContext);
  const { thread, project, cwd, status, failed } = useWorkspace(ref);
  const openInEditor = useOpenInEditor();
  const [branch, setBranch] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const canCreate = useAtomValue(vcsEnvironment.createWorktree.permissionAtom(ref.environmentId));
  usePaste((text) => setBranch((current) => (current === null ? null : current + text.trim())), {
    isActive: focused && branch !== null,
  });

  // As mobile: create the worktree from the current branch, then point the thread at it.
  const createWorktree = async (name: string) => {
    const baseRef = status?.refName;
    if (!project || !baseRef) {
      return setNote({ text: "Cannot find the current branch.", error: true });
    }
    setNote({ text: "Creating worktree…", error: false });
    const created = await runAtomCommand(
      registry,
      vcsEnvironment.createWorktree,
      {
        environmentId: ref.environmentId,
        input: { cwd: project.workspaceRoot, refName: baseRef, newRefName: name, path: null },
      },
      {},
      quiet,
    );
    if (created._tag !== "Success") {
      const error = squashAtomCommandFailure(created);
      return setNote({ text: error instanceof Error ? error.message : String(error), error: true });
    }
    const { worktree } = created.value;
    const bound = await runCommand(registry, threadEnvironment.updateMetadata, {
      environmentId: ref.environmentId,
      input: { threadId: ref.threadId, branch: worktree.refName, worktreePath: worktree.path },
    });
    setNote(
      bound === null
        ? { text: `Moved to ${worktree.path}`, error: false }
        : { text: bound, error: true },
    );
  };

  useRegionInput("panel", (press) => {
    if (!focused || !thread) return false;
    if (branch !== null) {
      if (isKey(press, "escape")) setBranch(null);
      else if (isKey(press, "enter")) {
        const name = sanitizeBranchFragment(branch);
        setBranch(null);
        if (name.length === 0) setNote({ text: "Enter a branch name.", error: true });
        else void createWorktree(name);
      } else {
        const next = editText(press, branch);
        if (next === null) return false;
        setBranch(next);
      }
      return true;
    }
    if (isKey(press, "y") && cwd) {
      copyToClipboard(cwd);
      setNote({ text: "Copied path.", error: false });
    } else if (isKey(press, "e") && cwd) {
      const error = openInEditor(cwd);
      setNote(error === null ? null : { text: error, error: true });
    } else if (isKey(press, "r") && cwd) {
      void runCommand(registry, vcsEnvironment.refreshStatus, {
        environmentId: ref.environmentId,
        input: { cwd },
      }).then((error) => setNote(error === null ? null : { text: error, error: true }));
    } else if (isKey(press, "w") && thread.worktreePath === null) {
      if (!canCreate) setNote({ text: "This connection cannot create worktrees.", error: true });
      else setBranch(buildTemporaryWorktreeBranchName(randomHex));
    } else return false;
    return true;
  });

  if (!thread) return <Text color={theme.textFaint}>Loading the thread…</Text>;
  const line = (name: string, value: string, color: string = theme.text) => (
    <Text wrap="truncate">
      <Text color={theme.textMuted}>{name.padEnd(10)}</Text>
      <Text color={color}>{value}</Text>
    </Text>
  );
  const files = status?.workingTree.files.length ?? 0;
  return (
    <Box flexDirection="column" width={width}>
      {line("Project", project?.title ?? "…")}
      {line("Branch", status?.refName ?? thread.branch ?? (status ? "detached" : "…"))}
      {line(
        "Worktree",
        thread.worktreePath ?? `main checkout${project ? ` (${project.workspaceRoot})` : ""}`,
      )}
      {status && !status.isRepo ? line("Git", "not a git repository", theme.textFaint) : null}
      {status?.isRepo ? (
        <>
          {line(
            "Remote",
            status.hasUpstream
              ? `↑${status.aheadCount} ahead · ↓${status.behindCount} behind`
              : "no upstream",
            status.behindCount > 0 ? theme.warning : theme.text,
          )}
          {line(
            "Changes",
            files === 0
              ? "clean"
              : `${files} file${files === 1 ? "" : "s"} +${status.workingTree.insertions} -${status.workingTree.deletions}`,
            files === 0 ? theme.success : theme.warning,
          )}
          {line(
            "PR",
            status.pr ? `#${status.pr.number} ${status.pr.state} · ${status.pr.title}` : "none",
            status.pr?.state === "open" ? theme.info : theme.textFaint,
          )}
        </>
      ) : null}
      {failed ? line("Git", "status unavailable", theme.danger) : null}
      <Text> </Text>
      {branch !== null ? (
        <>
          <Text color={theme.textMuted}>New worktree branch (from {status?.refName ?? "?"}):</Text>
          <TextField value={branch} />
          <Text color={theme.textFaint}>enter create and move thread · esc cancel</Text>
        </>
      ) : (
        <Text color={theme.textFaint} wrap="wrap">
          {thread.worktreePath === null ? "w new worktree · " : ""}y copy path · e open in $EDITOR ·
          r refresh
        </Text>
      )}
      {note ? (
        <Text color={note.error ? theme.danger : theme.success} wrap="wrap">
          {note.text}
        </Text>
      ) : null}
    </Box>
  );
}
