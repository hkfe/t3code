import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  pickSnoozePreset,
  resolveSnoozePresets,
} from "@t3tools/client-runtime/state/thread-settled";
import type { OrchestrationV2ThreadShell, ScopedThreadRef } from "@t3tools/contracts";
import { usePaste } from "ink";
import { useContext, useState } from "react";

import { Text } from "../../app/text.tsx";
import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { environmentShell } from "../../state/shell.ts";
import { threadEnvironment } from "../../state/threadCommands.ts";
import { theme } from "../../theme/theme.ts";
import {
  canOperateAtom,
  deleteThread,
  findThreadShell,
  menuAtom,
  openMenu,
  runCommand,
  runThreadAction,
  settle,
  type MenuState,
} from "./actions.ts";
import { parseCustomSnooze, threadMenuItems, type MenuItem } from "./menu.ts";
import { Dialog, editText, MenuRows, TextField, useListCursor } from "./ui.tsx";

interface PageProps extends TuiViewProps {
  readonly menu: MenuState;
  readonly thread: OrchestrationV2ThreadShell;
}

const LIST_HINT = "↑↓ move · enter choose · ←/h back · esc close";

function useBack(ref: ScopedThreadRef) {
  const registry = useContext(RegistryContext);
  return () => openMenu(registry, ref);
}

function RootPage({ menu, thread, width, height }: PageProps) {
  const registry = useContext(RegistryContext);
  const canOperate = useAtomValue(canOperateAtom(menu.thread.environmentId));
  const labels = useAtomValue(
    serverEnvironment.settingsValueAtom(menu.thread.environmentId),
  )?.threadLabels;
  // Read once: a snooze that ends while the menu is open still offers Wake.
  const [now] = useState(() => new Date());
  const items = threadMenuItems(thread, {
    canOperate,
    hasLabels: (labels?.length ?? 0) > 0,
    now,
  });
  const [cursor, move] = useListCursor(items.length);
  useRegionInput("overlay", (press) => {
    if (move(press)) return true;
    if (!isKey(press, "enter")) return false;
    const item = items[cursor];
    if (item && !item.disabled) runThreadAction(registry, menu.thread, item.id);
    return true;
  });
  return (
    <Dialog
      width={width}
      height={height}
      title={thread.title || "Untitled thread"}
      hint="↑↓ move · enter choose · esc close"
      error={menu.error}
    >
      <MenuRows items={items} cursor={cursor} height={height} />
    </Dialog>
  );
}

function SnoozePage({ menu, width, height }: PageProps) {
  const registry = useContext(RegistryContext);
  const back = useBack(menu.thread);
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(menu.thread.environmentId));
  const options = settings?.snoozePresets ? { presets: settings.snoozePresets } : {};
  // Read once, so the times shown do not move while the page is open.
  const [presets] = useState(() => resolveSnoozePresets(new Date(), options));
  const items: ReadonlyArray<MenuItem> = [
    ...presets.map((preset) => ({ id: preset.id, label: `${preset.label} (${preset.whenLabel})` })),
    { id: "custom", label: "Custom…" },
  ];
  const [cursor, move] = useListCursor(items.length);
  useRegionInput("overlay", (press) => {
    if (move(press)) return true;
    if (isKey(press, "arrowleft") || isKey(press, "h")) back();
    else if (isKey(press, "enter")) {
      const id = items[cursor]?.id;
      if (id === "custom") return (openMenu(registry, menu.thread, "snooze-custom"), true);
      const preset =
        id === undefined
          ? undefined
          : pickSnoozePreset({ shown: presets, id, now: new Date(), ...options });
      if (!preset) {
        openMenu(registry, menu.thread, "snooze", "That time has passed. Choose another.");
        return true;
      }
      void settle(
        registry,
        menu.thread,
        runCommand(registry, threadEnvironment.snooze, {
          environmentId: menu.thread.environmentId,
          input: { threadId: menu.thread.threadId, snoozedUntil: preset.snoozedUntil },
        }),
        "snooze",
      );
    } else return false;
    return true;
  });
  return (
    <Dialog width={width} height={height} title="Snooze until" hint={LIST_HINT} error={menu.error}>
      <MenuRows items={items} cursor={cursor} height={height} />
    </Dialog>
  );
}

function LabelsPage({ menu, thread, width, height }: PageProps) {
  const registry = useContext(RegistryContext);
  const back = useBack(menu.thread);
  const labels =
    useAtomValue(serverEnvironment.settingsValueAtom(menu.thread.environmentId))?.threadLabels ??
    [];
  const tags = thread.tags ?? [];
  const items: ReadonlyArray<MenuItem> = labels.map((label) => ({
    id: label.id,
    label: label.name,
    checked: tags.includes(label.id),
    color: theme.label[label.color],
  }));
  const [cursor, move] = useListCursor(items.length);
  useRegionInput("overlay", (press) => {
    if (move(press)) return true;
    if (isKey(press, "arrowleft") || isKey(press, "h")) back();
    else if (isKey(press, "enter") || isKey(press, "space")) {
      const item = items[cursor];
      if (!item) return true;
      // The list stays open; the shell stream redraws the check mark.
      void runCommand(registry, threadEnvironment.setTag, {
        environmentId: menu.thread.environmentId,
        input: { threadId: menu.thread.threadId, tag: item.id, tagged: !item.checked },
      }).then((error) => {
        if (error !== null) openMenu(registry, menu.thread, "labels", error);
      });
    } else return false;
    return true;
  });
  return (
    <Dialog
      width={width}
      height={height}
      title="Labels"
      hint="↑↓ move · space toggle · ←/h back · esc close"
      error={menu.error}
    >
      <MenuRows items={items} cursor={cursor} height={height} />
    </Dialog>
  );
}

function TextPage(props: {
  readonly menu: MenuState;
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly initial: string;
  readonly hint: string;
  readonly submit: (value: string) => void;
}) {
  const back = useBack(props.menu.thread);
  const [value, setValue] = useState(props.initial);
  usePaste((text) => setValue((current) => current + text.replace(/\s+/g, " ")));
  useRegionInput("overlay", (press) => {
    if (isKey(press, "enter")) props.submit(value);
    else if (isKey(press, "arrowleft") && value.length === 0) back();
    else {
      const next = editText(press, value);
      if (next === null) return false;
      setValue(next);
    }
    return true;
  });
  return (
    <Dialog
      width={props.width}
      height={props.height}
      title={props.title}
      hint={props.hint}
      error={props.menu.error}
    >
      <TextField value={value} />
    </Dialog>
  );
}

function RenamePage({ menu, thread, width, height }: PageProps) {
  const registry = useContext(RegistryContext);
  return (
    <TextPage
      menu={menu}
      width={width}
      height={height}
      title="Rename thread"
      initial={thread.title}
      hint="enter save · esc cancel"
      submit={(value) => {
        const title = value.trim();
        if (title.length === 0) return openMenu(registry, menu.thread, "rename", "Enter a title.");
        if (title === thread.title) return openMenu(registry, menu.thread);
        void settle(
          registry,
          menu.thread,
          runCommand(registry, threadEnvironment.updateMetadata, {
            environmentId: menu.thread.environmentId,
            input: { threadId: menu.thread.threadId, title },
          }),
          "rename",
        );
      }}
    />
  );
}

function CustomSnoozePage({ menu, width, height }: PageProps) {
  const registry = useContext(RegistryContext);
  return (
    <TextPage
      menu={menu}
      width={width}
      height={height}
      title="Snooze for or until"
      initial=""
      hint="90m · 2h · 3d · 2026-12-01 09:00 · enter snooze · esc cancel"
      submit={(value) => {
        const snoozedUntil = parseCustomSnooze(value, new Date());
        if (snoozedUntil === null) {
          return openMenu(registry, menu.thread, "snooze-custom", "Enter a future time.");
        }
        void settle(
          registry,
          menu.thread,
          runCommand(registry, threadEnvironment.snooze, {
            environmentId: menu.thread.environmentId,
            input: { threadId: menu.thread.threadId, snoozedUntil },
          }),
          "snooze-custom",
        );
      }}
    />
  );
}

function DeletePage({ menu, thread, width, height }: PageProps) {
  const registry = useContext(RegistryContext);
  useRegionInput("overlay", (press) => {
    if (!isKey(press, "enter") && !isKey(press, "y")) return false;
    void settle(registry, menu.thread, deleteThread(registry, menu.thread), "delete");
    return true;
  });
  return (
    <Dialog
      width={width}
      height={height}
      title={`Delete thread "${thread.title || "Untitled thread"}"?`}
      hint="enter or y delete · esc cancel"
      error={menu.error}
    >
      <Text color={theme.warning}>This permanently clears the conversation history.</Text>
    </Dialog>
  );
}

const PAGES = {
  root: RootPage,
  snooze: SnoozePage,
  "snooze-custom": CustomSnoozePage,
  labels: LabelsPage,
  rename: RenamePage,
  delete: DeletePage,
} satisfies Record<MenuState["mode"], unknown>;

function Menu({ menu, ...size }: TuiViewProps & { readonly menu: MenuState }) {
  const snapshot = useAtomValue(
    environmentShell.stateValueAtom(menu.thread.environmentId),
  ).snapshot;
  const thread = findThreadShell(snapshot, menu.thread.threadId);
  if (thread === undefined) {
    return (
      <Dialog {...size} title="Thread actions" hint="esc close">
        <Text color={theme.textFaint}>This thread is not on the server yet.</Text>
      </Dialog>
    );
  }
  const Page = PAGES[menu.mode];
  return <Page {...size} menu={menu} thread={thread} />;
}

export function ThreadActionsOverlay(props: TuiViewProps) {
  const menu = useAtomValue(menuAtom);
  if (menu === null) return null;
  // A new page (or thread) starts with a fresh cursor and text.
  return <Menu key={`${menu.thread.threadId}:${menu.mode}`} {...props} menu={menu} />;
}
