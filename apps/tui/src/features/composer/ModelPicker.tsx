import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Box } from "ink";
import { useContext, useState, type ReactNode } from "react";

import { Text } from "../../app/text.tsx";
import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { environmentShell } from "../../state/shell.ts";
import { overlayAtom, routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import {
  effortDescriptor,
  modelPickerRows,
  pickModel,
  resolveComposerSettings,
  type ModelPickerRow,
} from "./settings.ts";
import { composerDraftAtom, composerServer, threadKey } from "./state.ts";

export const MODEL_PICKER_OVERLAY = "composer.model-picker";

const rowKey = (row: ModelPickerRow) => `${row.provider.instanceId}/${row.model.slug}`;

function Frame(props: TuiViewProps & { readonly children: ReactNode }) {
  return (
    <Box
      flexDirection="column"
      width={props.width}
      height={props.height}
      borderStyle="round"
      borderColor={theme.borderFocused}
      paddingX={1}
    >
      {props.children}
    </Box>
  );
}

export function ModelPicker(props: TuiViewProps) {
  const thread = useAtomValue(routeAtom).thread;
  if (thread === null) {
    return (
      <Frame {...props}>
        <Text color={theme.textFaint}>Open a thread first. esc closes.</Text>
      </Frame>
    );
  }
  return <ThreadModelPicker {...props} thread={thread} />;
}

function ThreadModelPicker(props: TuiViewProps & { readonly thread: ScopedThreadRef }) {
  const { thread, height } = props;
  const registry = useContext(RegistryContext);
  const config = useAtomValue(composerServer.configValueAtom(thread.environmentId));
  const shell = useAtomValue(environmentShell.stateValueAtom(thread.environmentId));
  const threadShell = Option.getOrNull(shell.snapshot)?.threads.find(
    (entry) => entry.id === thread.threadId,
  );
  const draftAtom = composerDraftAtom(threadKey(thread));
  const draft = useAtomValue(draftAtom);
  const settings = threadShell ? resolveComposerSettings(threadShell, draft, config) : null;
  const [filter, setFilter] = useState("");
  const rows = modelPickerRows(config, filter);
  const currentIndex = rows.findIndex(
    (row) =>
      row.provider.instanceId === settings?.selection.instanceId &&
      row.model.slug === settings.selection.model,
  );
  const [index, setIndex] = useState(Math.max(0, currentIndex));
  const [efforts, setEfforts] = useState<Readonly<Record<string, string>>>({});
  const selected = Math.min(index, Math.max(0, rows.length - 1));

  const effortFor = (row: ModelPickerRow) => {
    const descriptor = effortDescriptor(row.model);
    if (!descriptor) return undefined;
    const isCurrent = rows.indexOf(row) === currentIndex;
    return (
      efforts[rowKey(row)] ??
      (isCurrent ? settings?.effortValue : undefined) ??
      descriptor.currentValue ??
      descriptor.options.find((option) => option.isDefault)?.id
    );
  };

  useRegionInput("overlay", (press) => {
    const row = rows[selected];
    if (isKey(press, "escape")) return false;
    if (isKey(press, "arrowup") || isKey(press, "arrowdown")) {
      const step = isKey(press, "arrowup") ? -1 : 1;
      if (rows.length > 0) setIndex((selected + step + rows.length) % rows.length);
      return true;
    }
    if (isKey(press, "arrowleft") || isKey(press, "arrowright")) {
      const descriptor = row ? effortDescriptor(row.model) : undefined;
      if (!row || !descriptor || descriptor.options.length === 0) return true;
      const step = isKey(press, "arrowleft") ? -1 : 1;
      const at = descriptor.options.findIndex((option) => option.id === effortFor(row));
      const next =
        descriptor.options[(at + step + descriptor.options.length) % descriptor.options.length]!;
      setEfforts({ ...efforts, [rowKey(row)]: next.id });
      return true;
    }
    if (isKey(press, "enter")) {
      if (row && settings) {
        registry.set(draftAtom, {
          ...registry.get(draftAtom),
          modelSelection: pickModel(settings.selection, row, effortFor(row)),
        });
      }
      registry.set(overlayAtom, null);
      return true;
    }
    if (isKey(press, "backspace")) {
      setFilter(filter.slice(0, -1));
      return true;
    }
    if (press.input.length > 0 && !press.key.ctrl && !press.key.meta) {
      setFilter(filter + press.input);
      setIndex(0);
      return true;
    }
    return false;
  });

  const listRows = Math.max(1, height - 4);
  const top = Math.max(0, Math.min(selected - Math.floor(listRows / 2), rows.length - listRows));
  return (
    <Frame {...props}>
      <Text color={theme.textMuted} bold wrap="truncate">
        Model <Text color={theme.text}>{filter}</Text>
        <Text color={theme.textFaint}> type to filter · ←→ effort · enter pick · esc close</Text>
      </Text>
      {rows.length === 0 ? (
        <Text color={theme.textFaint}>{config ? "No models match." : "Loading models…"}</Text>
      ) : (
        rows.slice(top, top + listRows).map((row, offset) => {
          const isSelected = top + offset === selected;
          const effort = effortDescriptor(row.model)?.options.find(
            (option) => option.id === effortFor(row),
          );
          return (
            <Box
              key={rowKey(row)}
              gap={2}
              {...(isSelected ? { backgroundColor: theme.selection } : {})}
            >
              <Box width={18} flexShrink={0}>
                <Text color={theme.textFaint} wrap="truncate">
                  {row.provider.displayName ?? row.provider.driver}
                </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text color={isSelected ? theme.accent : theme.text} wrap="truncate">
                  {top + offset === currentIndex ? "● " : "  "}
                  {row.model.name}
                </Text>
              </Box>
              {effort && <Text color={theme.info}>‹ {effort.label} ›</Text>}
            </Box>
          );
        })
      )}
    </Frame>
  );
}
