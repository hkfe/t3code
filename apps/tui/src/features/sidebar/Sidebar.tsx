import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { minuteTick } from "@t3tools/client-runtime/clock";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { threadLabelsOf, type OrchestrationV2WorkingPhase } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { Box, Text } from "ink";
import { useContext, useRef, useState, useSyncExternalStore } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey, type KeyPress } from "../../app/keys.ts";
import { environmentCatalog } from "../../state/catalog.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { environmentShell } from "../../state/shell.ts";
import { environmentThreadShells } from "../../state/threadShells.ts";
import { routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import {
  buildSidebarRows,
  isUnread,
  relativeTime,
  resolveWaitingReason,
  type SidebarRow,
  type SidebarThreadStatus,
} from "./sidebarModel.ts";

/** Folders and sections the user opened or closed; kept while the sidebar is hidden. */
const toggledAtom = Atom.make<ReadonlySet<string>>(new Set<string>()).pipe(Atom.keepAlive);

export const projectsAtom = Atom.make((get) =>
  Array.from(enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))).flatMap(
    (environmentId) => {
      const snapshot = get(environmentShell.stateValueAtom(environmentId)).snapshot;
      return Option.isSome(snapshot) ? [{ environmentId, projects: snapshot.value.projects }] : [];
    },
  ),
);

const PHASES: Record<OrchestrationV2WorkingPhase, { label: string; color: string }> = {
  reading: { label: "Reading", color: theme.info },
  editing: { label: "Editing", color: theme.label.violet },
  testing: { label: "Testing", color: theme.label.teal },
  reviewing: { label: "Reviewing", color: theme.label.pink },
  measuring: { label: "Measuring", color: theme.label.orange },
};

const NEEDS: Partial<Record<SidebarThreadStatus, { label: string; color: string }>> = {
  approval: { label: "Approval", color: theme.warning },
  input: { label: "Input", color: theme.warning },
  request: { label: "Guest", color: theme.warning },
  failed: { label: "Failed", color: theme.danger },
  limited: { label: "Limit", color: theme.danger },
};

function statusBadge(thread: EnvironmentThreadShell, status: SidebarThreadStatus, nowMs: number) {
  const needs = NEEDS[status];
  if (needs) return needs;
  if (status === "working") {
    return thread.workingPhase
      ? PHASES[thread.workingPhase]
      : { label: "Working", color: theme.accent };
  }
  if (status === "waiting") {
    return { label: resolveWaitingReason(thread) ?? "Waiting", color: theme.textMuted };
  }
  const time = thread.latestUserMessageAt ?? thread.updatedAt;
  return { label: relativeTime(time, nowMs), color: theme.textFaint };
}

function ThreadRow(props: {
  readonly row: Extract<SidebarRow, { kind: "thread" }>;
  readonly selected: boolean;
  readonly open: boolean;
  readonly nowMs: number;
}) {
  const { thread, status, nested } = props.row;
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(thread.environmentId));
  const labels = threadLabelsOf(thread.tags, settings?.threadLabels);
  const badge = statusBadge(thread, status, props.nowMs);
  return (
    <Box {...(props.selected ? { backgroundColor: theme.selection } : {})}>
      <Box flexShrink={0}>
        <Text color={theme.accent}>
          {nested ? "  " : ""}
          {isUnread(thread, status) ? "● " : "  "}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={4}>
        <Text wrap="truncate" color={props.open ? theme.accent : theme.text}>
          {thread.title || "Untitled thread"}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text>
          {labels.slice(0, 2).map((label) => (
            <Text key={label.id} color={theme.label[label.color]}>
              {" "}
              {label.name}
            </Text>
          ))}
          {labels.length > 2 ? <Text color={theme.textFaint}> +{labels.length - 2}</Text> : null}
          <Text color={badge.color}> {badge.label}</Text>
        </Text>
      </Box>
    </Box>
  );
}

function HeaderRow(props: {
  readonly row: Exclude<SidebarRow, { kind: "thread" }>;
  readonly selected: boolean;
}) {
  const { row } = props;
  const section = row.kind === "section";
  return (
    <Box {...(props.selected ? { backgroundColor: theme.selection } : {})}>
      <Text wrap="truncate" color={section ? theme.textMuted : theme.textFaint} bold={section}>
        {section ? "" : "  "}
        {row.collapsed ? "▸ " : "▾ "}
        {row.title}
        <Text color={theme.textFaint}> {row.count}</Text>
      </Text>
    </Box>
  );
}

const isPrintable = ({ input, key }: KeyPress) =>
  input.length > 0 &&
  !key.ctrl &&
  !key.meta &&
  !key.return &&
  !key.tab &&
  !key.escape &&
  input >= " ";

export function Sidebar({ focused, height }: TuiViewProps) {
  const registry = useContext(RegistryContext);
  const threads = useAtomValue(environmentThreadShells.quietThreadShellsAtom);
  const delegatedUnderParent = useAtomValue(environmentThreadShells.delegatedUnderParentAtom);
  const projects = useAtomValue(projectsAtom);
  const toggled = useAtomValue(toggledAtom);
  const route = useAtomValue(routeAtom);
  const [filter, setFilter] = useState("");
  const [typing, setTypingState] = useState(false);
  // Keys can arrive before the handler re-registers, so they read typing from the ref.
  const typingRef = useRef(false);
  const setTyping = (next: boolean) => {
    typingRef.current = next;
    setTypingState(next);
  };
  const [cursor, setCursor] = useState({ key: "", index: 0 });

  // One repaint a minute keeps relative times and snooze wakes current.
  const nowMs = Date.parse(
    `${useSyncExternalStore(minuteTick.subscribe, minuteTick.getSnapshot)}:00.000Z`,
  );
  const rows = buildSidebarRows({
    threads,
    projects,
    delegatedUnderParent,
    toggled,
    filter,
    now: new Date(nowMs).toISOString(),
  });
  const found = rows.findIndex((row) => row.key === cursor.key);
  const selected = found >= 0 ? found : Math.min(cursor.index, Math.max(0, rows.length - 1));
  const moveTo = (index: number) => {
    const next = Math.max(0, Math.min(index, rows.length - 1));
    setCursor({ key: rows[next]?.key ?? "", index: next });
  };
  const toggle = (key: string) => {
    const next = new Set(toggled);
    if (!next.delete(key)) next.add(key);
    registry.set(toggledAtom, next);
  };
  const activate = () => {
    const row = rows[selected];
    if (!row) return;
    if (row.kind !== "thread") return toggle(row.key);
    registry.set(routeAtom, {
      view: "thread",
      thread: { environmentId: row.thread.environmentId, threadId: row.thread.id },
    });
  };
  const navigate = (press: KeyPress): boolean => {
    if (isKey(press, "arrowdown")) moveTo(selected + 1);
    else if (isKey(press, "arrowup")) moveTo(selected - 1);
    else if (isKey(press, "pagedown")) moveTo(selected + height);
    else if (isKey(press, "pageup")) moveTo(selected - height);
    else if (isKey(press, "enter")) activate();
    else return false;
    return true;
  };

  useRegionInput(
    "sidebar",
    (press) => {
      if (typingRef.current) {
        if (isKey(press, "escape")) {
          setTyping(false);
          setFilter("");
        } else if (isKey(press, "enter")) {
          setTyping(false);
          activate();
        } else if (press.key.backspace || press.key.delete)
          setFilter((current) => current.slice(0, -1));
        else if (isPrintable(press)) {
          setFilter((current) => current + press.input);
          setCursor({ key: "", index: 0 });
        } else return navigate(press);
        return true;
      }
      if (navigate(press)) return true;
      const row = rows[selected];
      switch (press.key.ctrl || press.key.meta ? "" : press.input) {
        case "j":
          moveTo(selected + 1);
          return true;
        case "k":
          moveTo(selected - 1);
          return true;
        case "g":
          moveTo(0);
          return true;
        case "G":
          moveTo(rows.length - 1);
          return true;
        case "/":
          setTyping(true);
          return true;
        case " ":
          if (row && row.kind !== "thread") toggle(row.key);
          return true;
        case "h":
          return collapse();
        case "l":
          return expand();
      }
      if (isKey(press, "arrowleft")) return collapse();
      if (isKey(press, "arrowright")) return expand();
      if (isKey(press, "escape") && filter !== "") {
        setFilter("");
        return true;
      }
      return false;

      function collapse() {
        // On a thread, fold the folder or section above it and land on its header.
        for (let index = selected; index >= 0; index--) {
          const header = rows[index];
          if (!header || header.kind === "thread") continue;
          if (!header.collapsed) toggle(header.key);
          setCursor({ key: header.key, index });
          return true;
        }
        return true;
      }
      function expand() {
        if (row && row.kind !== "thread" && row.collapsed) toggle(row.key);
        return true;
      }
    },
    { first: typing },
  );

  const showFilter = typing || filter !== "";
  const listHeight = Math.max(1, height - (showFilter ? 1 : 0));
  const first = Math.max(
    0,
    Math.min(selected - Math.floor(listHeight / 2), rows.length - listHeight),
  );
  return (
    <Box flexDirection="column">
      {showFilter ? (
        <Text wrap="truncate" color={typing ? theme.accent : theme.textMuted}>
          / {filter}
          {typing ? "▏" : ""}
        </Text>
      ) : null}
      {rows.length === 0 ? (
        <Text color={theme.textFaint}>
          {showFilter ? "No matching threads." : "No threads yet."}
        </Text>
      ) : null}
      {rows.slice(first, first + listHeight).map((row, offset) => {
        const isSelected = focused && first + offset === selected;
        return row.kind === "thread" ? (
          <ThreadRow
            key={row.key}
            row={row}
            selected={isSelected}
            open={
              route.thread?.threadId === row.thread.id &&
              route.thread?.environmentId === row.thread.environmentId
            }
            nowMs={nowMs}
          />
        ) : (
          <HeaderRow key={row.key} row={row} selected={isSelected} />
        );
      })}
    </Box>
  );
}
