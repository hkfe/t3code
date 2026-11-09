import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { ThreadId, type ProjectId, type ThreadEnvMode } from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import { Text } from "ink";
import { useContext, useState } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { newThreadDraftAtom } from "../../state/newThread.ts";
import { focusAtom, overlayAtom, routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { newThreadTargetsAtom, ensureScratchProject, type NewThreadTarget } from "./newThread.ts";
import { runCommand } from "./actions.ts";
import { Dialog, MenuRows, useListCursor } from "./ui.tsx";

const random = SecureRandom.make((size) => globalThis.crypto.getRandomValues(new Uint8Array(size)));

export function NewThreadOverlay({ width, height }: TuiViewProps) {
  const registry = useContext(RegistryContext);
  const targets = useAtomValue(newThreadTargetsAtom);
  const [cursor, move] = useListCursor(targets.length);
  // Null follows the selected project's default; tab picks one for this thread.
  const [envModeChoice, setEnvModeChoice] = useState<ThreadEnvMode | null>(null);
  const [status, setStatus] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const target = targets[cursor];
  const scratch = target?.projectId === null;
  // The scratch folder is not a repository, so it has no worktrees.
  const envMode = scratch ? "local" : (envModeChoice ?? target?.defaultEnvMode ?? "local");

  const open = (target: NewThreadTarget, projectId: ProjectId) => {
    const threadId = ThreadId.make(Effect.runSync(random.uuidV4()));
    registry.set(newThreadDraftAtom, {
      environmentId: target.environmentId,
      threadId,
      projectId,
      envMode,
    });
    registry.set(routeAtom, {
      view: "thread",
      thread: { environmentId: target.environmentId, threadId },
    });
    registry.set(focusAtom, "main");
    registry.set(overlayAtom, null);
  };

  const start = async (target: NewThreadTarget) => {
    if (target.projectId !== null) return open(target, target.projectId);
    setStatus({ busy: true, error: null });
    let projectId: ProjectId | null = null;
    const error = await runCommand(
      registry,
      {
        label: ensureScratchProject.label,
        run: (registry, input) =>
          ensureScratchProject.run(registry, input).then((result) => {
            if (result._tag === "Success") projectId = result.value.projectId;
            return result;
          }),
      },
      { environmentId: target.environmentId, input: {} },
    );
    if (projectId !== null) return open(target, projectId);
    setStatus({ busy: false, error: error ?? "Could not start without a project." });
  };

  useRegionInput("overlay", (press) => {
    if (status.busy) return !isKey(press, "escape");
    if (move(press)) return true;
    if (isKey(press, "tab") && !scratch) {
      setEnvModeChoice(envMode === "local" ? "worktree" : "local");
    } else if (isKey(press, "enter")) {
      if (target && !target.disabled) void start(target);
    } else return false;
    return true;
  });

  return (
    <Dialog
      width={width}
      height={height}
      title="New thread in"
      hint={`↑↓ move · ${scratch ? "" : "tab local/worktree · "}enter start · esc close`}
      error={status.error}
    >
      {targets.length === 0 ? (
        <Text color={theme.textFaint}>No projects yet.</Text>
      ) : (
        <MenuRows
          items={targets.map((entry) => ({
            id: entry.key,
            label: entry.label,
            disabled: entry.disabled,
          }))}
          cursor={cursor}
          height={height - 1}
        />
      )}
      <Text color={theme.textMuted} wrap="truncate">
        {status.busy
          ? "Opening the scratch folder…"
          : `Mode: ${envMode === "worktree" ? "new worktree" : "local checkout"}`}
      </Text>
    </Dialog>
  );
}
