import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { THREAD_LABEL_COLORS, type ThreadLabel } from "@t3tools/contracts";
import * as Equal from "effect/Equal";
import * as Option from "effect/Option";
import { Text } from "ink";
import { useContext, useEffect, useState } from "react";

import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { environmentShell } from "../../state/shell.ts";
import { theme } from "../../theme/theme.ts";
import { runCommand } from "../thread-actions/actions.ts";
import { editText, TextField } from "../thread-actions/ui.tsx";
import { labelEditorAtom, labelUsage, reduceLabels, type LabelAction } from "./labels.ts";
import { Row, SectionBody, type SectionProps } from "./SettingsOverlay.tsx";

const HINT = "↑↓ move · enter rename · ←→ color · J/K reorder · a add · d delete · esc close";

export function LabelsSection({ environmentId, height }: SectionProps) {
  const registry = useContext(RegistryContext);
  const saved =
    useAtomValue(serverEnvironment.settingsValueAtom(environmentId))?.threadLabels ?? [];
  const canWrite = useAtomValue(
    serverEnvironment.updateSettings.permissionAtom(environmentId, { patch: { threadLabels: [] } }),
  );
  const shell = Option.getOrNull(
    useAtomValue(environmentShell.stateValueAtom(environmentId)).snapshot,
  );
  const editorAtom = labelEditorAtom(environmentId);
  const editor = useAtomValue(editorAtom);
  const { draft, mode } = editor;
  const [error, setError] = useState<string | null>(null);
  const labels = draft ?? saved;
  const cursor = Math.min(editor.cursor, Math.max(0, labels.length - 1));
  const label: ThreadLabel | undefined = labels[cursor];

  // The server echoed the draft, so the saved list takes over again.
  useEffect(() => {
    if (draft !== null && Equal.equals(draft, saved)) {
      registry.update(editorAtom, (state) =>
        state.draft === draft ? { ...state, draft: null } : state,
      );
    }
  }, [registry, editorAtom, draft, saved]);

  // Reads the atom, not render values: two fast keys must both see the newest state.
  const dispatch = (action: LabelAction) => {
    const before = registry.get(editorAtom);
    const after = reduceLabels(before, saved, action);
    registry.set(editorAtom, after);
    const next = after.draft;
    if (next === null || next === before.draft) return;
    setError(null);
    void runCommand(registry, serverEnvironment.updateSettings, {
      environmentId,
      input: { patch: { threadLabels: next } },
    }).then((failure) => {
      if (failure === null) return;
      registry.update(editorAtom, (state) => ({ ...state, draft: null }));
      setError(failure);
    });
  };

  useRegionInput("overlay", (press) => {
    const state = registry.get(editorAtom);
    if (state.mode.kind === "rename") {
      if (isKey(press, "escape")) dispatch({ type: "cancel" });
      else if (isKey(press, "enter")) dispatch({ type: "commitRename" });
      else {
        const value = editText(press, state.mode.value);
        if (value === null) return !press.key.ctrl;
        dispatch({ type: "rename", value });
      }
      return true;
    }
    if (state.mode.kind === "delete") {
      dispatch(isKey(press, "y") ? { type: "confirmDelete" } : { type: "cancel" });
      return !press.key.ctrl;
    }
    const current = (state.draft ?? saved)[state.cursor];
    if (isKey(press, "arrowdown") || isKey(press, "j")) dispatch({ type: "cursor", by: 1 });
    else if (isKey(press, "arrowup") || isKey(press, "k")) dispatch({ type: "cursor", by: -1 });
    else if (!canWrite) return false;
    else if (isKey(press, "a"))
      dispatch({ type: "add", id: `label-${Math.random().toString(36).slice(2, 10)}` });
    else if (!current) return false;
    else if (isKey(press, "enter")) dispatch({ type: "rename", value: current.name });
    else if (isKey(press, "arrowright") || isKey(press, "l")) dispatch({ type: "recolor", by: 1 });
    else if (isKey(press, "arrowleft") || isKey(press, "h")) dispatch({ type: "recolor", by: -1 });
    else if (press.input === "J") dispatch({ type: "reorder", by: 1 });
    else if (press.input === "K") dispatch({ type: "reorder", by: -1 });
    else if (isKey(press, "d")) {
      const threads = shell ? [...shell.threads, ...shell.archivedThreads] : [];
      dispatch({ type: "askDelete", uses: labelUsage(threads).get(current.id) ?? 0 });
    } else return false;
    return true;
  });

  const rows = labels.map((entry, index) => (
    <Row key={entry.id} selected={index === cursor}>
      <Text color={theme.label[entry.color]}>●</Text>
      {mode.kind === "rename" && index === cursor ? (
        <TextField value={mode.value} />
      ) : (
        <Text color={theme.text} wrap="truncate">
          {entry.name}
        </Text>
      )}
      <Text color={theme.textFaint}>{entry.color}</Text>
    </Row>
  ));
  const footer = label ? (
    <Text wrap="truncate">
      {THREAD_LABEL_COLORS.map((color) => (
        <Text key={color} color={theme.label[color]} inverse={color === label.color}>
          {" ● "}
        </Text>
      ))}
    </Text>
  ) : null;
  const status =
    mode.kind === "delete"
      ? `Delete "${label?.name}"? ${
          mode.uses > 0
            ? `${mode.uses} thread${mode.uses === 1 ? "" : "s"} use it; it is removed from them.`
            : "No thread uses it."
        } y deletes, any other key keeps it.`
      : null;
  return (
    <SectionBody
      height={height}
      cursor={cursor}
      rows={
        rows.length > 0
          ? rows
          : [
              <Text key="empty" color={theme.textFaint}>
                No labels. Press a to add one.
              </Text>,
            ]
      }
      footer={footer}
      error={status ?? error ?? (canWrite ? null : "This connection cannot change settings.")}
      hint={mode.kind === "rename" ? "enter save · esc cancel" : HINT}
    />
  );
}
