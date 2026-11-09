import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type {
  ModelSelection,
  RuntimeMode,
  ServerConfig,
  ServerSettingsPatch,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { Text } from "ink";
import { useContext, useState } from "react";

import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { theme } from "../../theme/theme.ts";
import { modelPickerRows, RUNTIME_MODE_LABELS } from "../composer/settings.ts";
import { runCommand } from "../thread-actions/actions.ts";
import { editText, TextField, useListCursor } from "../thread-actions/ui.tsx";
import { Row, SectionBody, type SectionProps } from "./SettingsOverlay.tsx";

type ModelKey = "defaultModelSelection" | "fallbackModelSelection" | "textGenerationModelSelection";

const MODEL_ROWS: ReadonlyArray<{
  readonly key: ModelKey;
  readonly title: string;
  /** Shown for null; null rows can be picked only where the setting allows it. */
  readonly automatic: string | null;
}> = [
  { key: "defaultModelSelection", title: "New threads", automatic: "Automatic" },
  { key: "fallbackModelSelection", title: "Fallback", automatic: "Same as new threads" },
  { key: "textGenerationModelSelection", title: "Titles and commit text", automatic: null },
];
const RUNTIME_MODES = Object.keys(RUNTIME_MODE_LABELS) as RuntimeMode[];

function modelName(config: ServerConfig | null, selection: ModelSelection | null | undefined) {
  if (!selection) return null;
  const provider = config?.providers.find((entry) => entry.instanceId === selection.instanceId);
  const model = provider?.models.find((entry) => entry.slug === selection.model);
  return `${provider?.displayName ?? provider?.driver ?? selection.instanceId} · ${model?.name ?? selection.model}`;
}

export function ModelsSection({ environmentId, height }: SectionProps) {
  const registry = useContext(RegistryContext);
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  const canWrite = useAtomValue(
    serverEnvironment.updateSettings.permissionAtom(environmentId, {
      patch: { defaultRuntimeMode: "full-access" },
    }),
  );
  const [cursor, move] = useListCursor(MODEL_ROWS.length + 1);
  const [picking, setPicking] = useState<{
    readonly filter: string;
    readonly index: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const row = MODEL_ROWS[cursor];
  const choices = [
    ...(row?.automatic ? [null] : []),
    ...modelPickerRows(config, picking?.filter ?? ""),
  ];

  const write = (patch: ServerSettingsPatch) => {
    setError(null);
    void runCommand(registry, serverEnvironment.updateSettings, {
      environmentId,
      input: { patch },
    }).then(setError);
  };

  useRegionInput("overlay", (press) => {
    if (picking !== null) {
      const index = Math.min(picking.index, Math.max(0, choices.length - 1));
      if (isKey(press, "escape")) setPicking(null);
      else if (isKey(press, "arrowdown"))
        setPicking({ ...picking, index: Math.min(index + 1, choices.length - 1) });
      else if (isKey(press, "arrowup")) setPicking({ ...picking, index: Math.max(index - 1, 0) });
      else if (isKey(press, "enter")) {
        const choice = choices[index];
        if (row && choice !== undefined) {
          write({
            [row.key]:
              choice && createModelSelection(choice.provider.instanceId, choice.model.slug),
          });
        }
        setPicking(null);
      } else {
        if (editText(press, "") === null) return !press.key.ctrl;
        // An updater, so fast typing never builds on a stale render.
        setPicking(
          (current) =>
            current && { filter: editText(press, current.filter) ?? current.filter, index: 0 },
        );
      }
      return true;
    }
    if (move(press)) return true;
    if (!canWrite || !(isKey(press, "enter") || isKey(press, "space"))) return false;
    if (row) setPicking({ filter: "", index: 0 });
    else if (settings) {
      const next =
        RUNTIME_MODES[
          (RUNTIME_MODES.indexOf(settings.defaultRuntimeMode) + 1) % RUNTIME_MODES.length
        ];
      if (next) write({ defaultRuntimeMode: next });
    }
    return true;
  });

  if (picking !== null && row) {
    const index = Math.min(picking.index, Math.max(0, choices.length - 1));
    return (
      <SectionBody
        height={height}
        cursor={index}
        rows={choices.map((choice, at) => (
          <Row
            key={choice ? `${choice.provider.instanceId}/${choice.model.slug}` : "auto"}
            selected={at === index}
          >
            <Text color={theme.text} wrap="truncate">
              {choice
                ? `${choice.provider.displayName ?? choice.provider.driver} · ${choice.model.name}`
                : row.automatic}
            </Text>
          </Row>
        ))}
        footer={<TextField value={picking.filter} />}
        hint={`${row.title}: type to filter · ↑↓ move · enter pick · esc cancel`}
      />
    );
  }

  const rows = [
    ...MODEL_ROWS.map((entry, index) => (
      <Row key={entry.key} selected={index === cursor}>
        <Text color={theme.textMuted}>{entry.title.padEnd(24)}</Text>
        <Text color={theme.text} wrap="truncate">
          {modelName(config, settings?.[entry.key]) ?? entry.automatic ?? "Not set"}
        </Text>
      </Row>
    )),
    <Row key="runtime" selected={cursor === MODEL_ROWS.length}>
      <Text color={theme.textMuted}>{"Default access".padEnd(24)}</Text>
      <Text color={theme.text}>
        {settings ? RUNTIME_MODE_LABELS[settings.defaultRuntimeMode] : "…"}
      </Text>
    </Row>,
  ];
  return (
    <SectionBody
      height={height}
      cursor={cursor}
      rows={rows}
      error={error ?? (canWrite ? null : "This connection cannot change settings.")}
      hint="↑↓ move · enter pick a model or cycle access · esc close"
    />
  );
}
