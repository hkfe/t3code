import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { StorageCleanupSettings } from "@t3tools/contracts";
import { resolveWorktreeCleanup } from "@t3tools/shared/projectSettings";
import { Box, Text } from "ink";
import { useContext, useState } from "react";

import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { theme } from "../../theme/theme.ts";
import { runCommand } from "../thread-actions/actions.ts";
import { editText, TextField, useListCursor } from "../thread-actions/ui.tsx";
import { Row, SectionBody, type SectionProps } from "./SettingsOverlay.tsx";
import { formatStorageValue, nextKeepWhen, parseDays, STORAGE_ROWS } from "./storage.ts";

type Mode =
  | { readonly kind: "list" }
  | { readonly kind: "days"; readonly text: string }
  | { readonly kind: "confirm"; readonly patch: Partial<StorageCleanupSettings> };

/** Cleanup rules delete worktrees and files, so every change waits for `y`. */
export function StorageSection({ environmentId, height }: SectionProps) {
  const registry = useContext(RegistryContext);
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  const canWrite = useAtomValue(
    serverEnvironment.updateSettings.permissionAtom(environmentId, {
      patch: { storageCleanup: {} },
    }),
  );
  const supported = config?.environment.capabilities.storageCleanup === true;
  const [cursor, move] = useListCursor(STORAGE_ROWS.length);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);
  const row = STORAGE_ROWS[cursor]!;
  const values: StorageCleanupSettings | null = settings && {
    ...settings.storageCleanup,
    ...resolveWorktreeCleanup(settings, null),
  };

  useRegionInput("overlay", (press) => {
    if (mode.kind === "confirm") {
      if (isKey(press, "y")) {
        setError(null);
        void runCommand(registry, serverEnvironment.updateSettings, {
          environmentId,
          input: { patch: { storageCleanup: mode.patch } },
        }).then(setError);
      }
      setMode({ kind: "list" });
      return !press.key.ctrl;
    }
    if (mode.kind === "days") {
      if (isKey(press, "escape")) setMode({ kind: "list" });
      else if (isKey(press, "enter")) {
        const days = parseDays(mode.text, row.minDays ?? 1);
        if (days === undefined)
          setError(`Type ${row.minDays ?? 1} to 3650 days, or nothing for off.`);
        else setMode({ kind: "confirm", patch: { [row.key]: days } });
      } else {
        if (editText(press, "") === null) return !press.key.ctrl;
        // An updater, so fast typing never builds on a stale render.
        setMode((current) =>
          current.kind === "days"
            ? { kind: "days", text: (editText(press, current.text) ?? "").slice(0, 4) }
            : current,
        );
      }
      return true;
    }
    if (move(press)) {
      setError(null);
      return true;
    }
    if (!(isKey(press, "enter") || isKey(press, "space")) || !values || !supported || !canWrite) {
      return false;
    }
    const value = values[row.key];
    if (row.kind === "days") setMode({ kind: "days", text: value === null ? "" : `${value}` });
    else if (row.kind === "toggle")
      setMode({ kind: "confirm", patch: { [row.key]: value !== true } });
    else
      setMode({
        kind: "confirm",
        patch: { worktreeKeepWhen: nextKeepWhen(values.worktreeKeepWhen) },
      });
    return true;
  });

  if (!supported) {
    return <Text color={theme.textFaint}>This server does not support storage cleanup.</Text>;
  }
  const rows = STORAGE_ROWS.map((entry, index) => (
    <Row key={entry.key} selected={index === cursor}>
      <Text color={theme.textMuted}>{entry.title.padEnd(40)}</Text>
      {mode.kind === "days" && index === cursor ? (
        <TextField value={mode.text} />
      ) : (
        <Text color={theme.text}>
          {values ? formatStorageValue(entry, values[entry.key]) : "…"}
        </Text>
      )}
    </Row>
  ));
  const proposed = mode.kind === "confirm" ? Object.values(mode.patch)[0] : undefined;
  const footer =
    mode.kind === "confirm" ? (
      <Box flexDirection="column">
        <Text color={theme.warning}>
          Set "{row.title}" to {formatStorageValue(row, proposed)}? {row.warning}
        </Text>
        <Text color={theme.warning}>y saves · any other key cancels</Text>
      </Box>
    ) : (
      <Text color={theme.textFaint} wrap="truncate">
        {row.warning}
      </Text>
    );
  return (
    <SectionBody
      height={height - 2}
      cursor={cursor}
      rows={rows}
      footer={footer}
      error={error ?? (canWrite ? null : "This connection cannot change settings.")}
      hint={
        mode.kind === "days"
          ? "type days, empty for off · enter next · esc cancel"
          : "↑↓ move · enter change · esc close"
      }
    />
  );
}
