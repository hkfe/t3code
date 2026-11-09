import {
  DEFAULT_THREAD_LABELS,
  MAX_THREAD_LABELS,
  THREAD_LABEL_COLORS,
  type ThreadLabel,
  type ThreadLabelColor,
} from "@t3tools/contracts";
import * as Equal from "effect/Equal";
import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";

import { cn, randomUUID } from "../../lib/utils";
import { THREAD_LABEL_COLOR_CLASS, ThreadLabelPill } from "../ThreadLabelPills";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { reconcileSnoozeDraft } from "./SnoozePresetsSettings.logic";
import { searchableSetting } from "./settingsSearch";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

const COLOR_ITEMS = Object.fromEntries(THREAD_LABEL_COLORS.map((color) => [color, color]));

function ColorSwatch(props: { color: ThreadLabelColor }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-3 shrink-0 rounded-full",
        THREAD_LABEL_COLOR_CLASS[props.color],
        "bg-current",
      )}
    />
  );
}

/** Edits the labels agents and users may put on threads. Ids stay fixed, so renames keep them. */
export function ThreadLabelsRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["threadLabels"]);
  const saved = settings.threadLabels;
  // Edits build on a local draft, so a second edit before the first echo does not undo it.
  const [labels, setLabels] = useState(saved);
  // Null forces the next render to adopt the saved value, as after a failed write.
  const [savedSource, setSavedSource] = useState<ReadonlyArray<ThreadLabel> | null>(saved);
  const [written, setWritten] = useState<ReadonlyArray<ReadonlyArray<ThreadLabel>>>([]);
  if (!Equal.equals(savedSource, saved)) {
    setSavedSource(saved);
    const reconciled = reconcileSnoozeDraft(written, saved);
    if (reconciled.adopt) {
      setWritten([]);
      setLabels(saved);
    } else {
      setWritten(reconciled.pending);
    }
  }
  const save = (threadLabels: ReadonlyArray<ThreadLabel>) => {
    if (!mixed && Equal.equals(threadLabels, labels)) return;
    setLabels(threadLabels);
    setWritten((previous) => [...previous, threadLabels]);
    updateSettings(
      { threadLabels },
      {
        onFailed: () => {
          setWritten([]);
          setSavedSource(null);
        },
      },
    );
  };
  const replaceAt = (index: number, next: ThreadLabel) =>
    save(labels.map((label, candidate) => (candidate === index ? next : label)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...labels];
    const [label] = next.splice(index, 1);
    next.splice(index + by, 0, label!);
    save(next);
  };
  const addLabel = () => {
    const color = THREAD_LABEL_COLORS[labels.length % THREAD_LABEL_COLORS.length]!;
    // A fresh id, so a deleted label left on old threads never comes back under a new name.
    save([...labels, { id: `label-${randomUUID().slice(0, 8)}`, name: "new label", color }]);
  };

  return (
    <SettingsRow
      serverScoped
      settingKeys={["threadLabels"]}
      {...searchableSetting("thread-labels")}
      description="Color-coded labels for threads. Agents can only pick labels from this list. Deleting a label removes it from every thread."
      resetAction={
        !mixed && Equal.equals(labels, DEFAULT_THREAD_LABELS) ? null : (
          <SettingResetButton label="thread labels" onClick={() => save(DEFAULT_THREAD_LABELS)} />
        )
      }
    >
      <div className="flex flex-col gap-1.5 pt-3 pb-2">
        {labels.map((label, index) => (
          <div
            key={label.id}
            role="group"
            aria-label={`Label ${label.name}`}
            className="flex items-center gap-2"
          >
            <Input
              key={label.name}
              nativeInput
              size="sm"
              className="w-40"
              aria-label="Label name"
              defaultValue={label.name}
              maxLength={32}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim();
                if (name === "") {
                  event.currentTarget.value = label.name;
                  return;
                }
                if (name !== label.name) replaceAt(index, { ...label, name });
              }}
            />
            <Select
              value={label.color}
              items={COLOR_ITEMS}
              onValueChange={(color) => {
                const next = THREAD_LABEL_COLORS.find((candidate) => candidate === color);
                if (next) replaceAt(index, { ...label, color: next });
              }}
            >
              <SelectTrigger size="sm" className="w-28" aria-label="Label color">
                <ColorSwatch color={label.color} />
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {THREAD_LABEL_COLORS.map((color) => (
                  <SelectItem hideIndicator key={color} value={color}>
                    <span className="flex items-center gap-2">
                      <ColorSwatch color={color} />
                      {color}
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <ThreadLabelPill label={label} />
            <div className="ml-auto flex items-center">
              <Button
                variant="ghost-muted"
                size="icon-sm"
                aria-label={`Move ${label.name} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                variant="ghost-muted"
                size="icon-sm"
                aria-label={`Move ${label.name} down`}
                disabled={index === labels.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                variant="ghost-destructive"
                size="icon-sm"
                aria-label={`Delete ${label.name}`}
                onClick={() => save(labels.filter((_, candidate) => candidate !== index))}
              >
                <XIcon />
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            variant="ghost-muted"
            size="compact"
            disabled={labels.length >= MAX_THREAD_LABELS}
            onClick={addLabel}
          >
            <PlusIcon />
            Add label
          </Button>
        </div>
      </div>
    </SettingsRow>
  );
}
