import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  formatWorkingDurationLabel,
  resolveThreadWorkingStartedAt,
} from "@t3tools/client-runtime/state/models";
import { threadLabelsOf, type ScopedThreadRef } from "@t3tools/contracts";
import { Box, Text } from "ink";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { environmentThreadDetails } from "../../state/threads.ts";
import { environmentThreadShells } from "../../state/threadShells.ts";
import { focusAtom, overlayAtom, routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { PHASES, projectsAtom } from "../sidebar/Sidebar.tsx";
import { relativeTime } from "../sidebar/sidebarModel.ts";
import {
  buildOverview,
  columnsFor,
  gridRows,
  moveSelection,
  plainText,
  type Direction,
  type OverviewEntry,
  type OverviewGroup,
} from "./overviewModel.ts";

const CARD_HEIGHT = 9;
const NEEDS_LABEL: Record<string, string> = {
  approval: "Needs approval",
  input: "Asked you a question",
  request: "Guest message waiting",
  limited: "Hit a usage limit",
  failed: "Failed",
};
const MOVES: ReadonlyArray<[string, Direction]> = [
  ["arrowleft", "left"],
  ["h", "left"],
  ["arrowright", "right"],
  ["l", "right"],
  ["arrowup", "up"],
  ["k", "up"],
  ["arrowdown", "down"],
  ["j", "down"],
];

const refOf = ({ thread }: OverviewEntry): ScopedThreadRef => ({
  environmentId: thread.environmentId,
  threadId: thread.id,
});

function statusLine(entry: OverviewEntry, group: OverviewGroup, nowMs: number) {
  const { thread, status } = entry;
  if (group === "needs") {
    return {
      text: NEEDS_LABEL[status] ?? "Needs you",
      color: status === "failed" || status === "limited" ? theme.danger : theme.warning,
    };
  }
  if (group === "working") {
    const phase = thread.workingPhase ? PHASES[thread.workingPhase] : null;
    const startedAt = resolveThreadWorkingStartedAt(thread);
    const elapsed =
      startedAt === null ? "" : ` · ${formatWorkingDurationLabel(nowMs - Date.parse(startedAt))}`;
    return {
      text: `${phase?.label ?? "Working"}${elapsed}`,
      color: phase?.color ?? theme.accent,
    };
  }
  const ago = relativeTime(thread.latestUserMessageAt ?? thread.updatedAt, nowMs);
  return { text: `Idle · ${ago === "now" ? "just now" : `${ago} ago`}`, color: theme.textFaint };
}

/** The thread's last message; reading it subscribes to the thread only while the card shows. */
function Preview({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const items = useAtomValue(environmentThreadDetails.visibleTurnItemsAtom(threadRef));
  const last = items
    .map((entry) => entry.item)
    .findLast(
      (item) =>
        (item.type === "user_message" || item.type === "assistant_message") &&
        item.text.trim() !== "",
    );
  if (!last || (last.type !== "user_message" && last.type !== "assistant_message")) {
    return <Text color={theme.textFaint}>No messages yet.</Text>;
  }
  return (
    <Text color={theme.textMuted} wrap="wrap">
      <Text color={theme.text}>{last.type === "user_message" ? "You: " : "Agent: "}</Text>
      {plainText(last.text.slice(0, 400))}
    </Text>
  );
}

function Card(props: {
  readonly entry: OverviewEntry;
  readonly group: OverviewGroup;
  readonly index: number;
  readonly selected: boolean;
  readonly project: string;
  readonly width: number;
  readonly nowMs: number;
}) {
  const { thread } = props.entry;
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(thread.environmentId));
  const labels = threadLabelsOf(thread.tags, settings?.threadLabels);
  const status = statusLine(props.entry, props.group, props.nowMs);
  return (
    <Box
      width={props.width}
      height={CARD_HEIGHT}
      flexDirection="column"
      borderStyle="round"
      borderColor={props.selected ? theme.borderFocused : theme.border}
      paddingX={1}
    >
      <Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate" color={theme.textMuted}>
            {props.project}
          </Text>
        </Box>
        {props.index < 9 ? <Text color={theme.textFaint}> {props.index + 1}</Text> : null}
      </Box>
      <Text wrap="truncate" bold color={props.selected ? theme.accent : theme.text}>
        {thread.title || "Untitled thread"}
      </Text>
      <Text wrap="truncate" color={theme.textFaint}>
        {thread.branch ?? " "}
      </Text>
      <Text wrap="truncate">
        {labels.length === 0
          ? " "
          : labels.map((label, i) => (
              <Text key={label.id} color={theme.label[label.color]}>
                {i > 0 ? " " : ""}
                {label.name}
              </Text>
            ))}
      </Text>
      <Box height={2} overflow="hidden">
        <Preview threadRef={refOf(props.entry)} />
      </Box>
      <Text wrap="truncate" color={status.color}>
        ● {status.text}
      </Text>
    </Box>
  );
}

/** Every agent at a glance (web's Option+` overview): needs you, working with live timers, recent. */
export function AgentOverview({ width, height }: TuiViewProps) {
  const registry = useContext(RegistryContext);
  const threads = useAtomValue(environmentThreadShells.quietThreadShellsAtom);
  const projects = useAtomValue(projectsAtom);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selected, setSelectedState] = useState(0);
  // Keys can arrive before the handler re-registers, so they read the cursor from the ref.
  const selectedRef = useRef(0);
  const setSelected = (next: number) => {
    selectedRef.current = next;
    setSelectedState(next);
  };

  // One-second clock for the working timers; this overlay mounts only while open.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sections = buildOverview(threads, new Date(nowMs).toISOString());
  const entries = sections.flatMap((section) => section.entries);
  const columns = columnsFor(width);
  const rows = gridRows(sections, columns);
  const clamp = (value: number) => Math.min(value, Math.max(0, entries.length - 1));
  const cursor = clamp(selected);

  const open = (entry: OverviewEntry | undefined) => {
    if (!entry) return;
    registry.set(overlayAtom, null);
    registry.set(routeAtom, { view: "thread", thread: refOf(entry) });
    registry.set(focusAtom, "main");
  };

  useRegionInput("overlay", (press) => {
    const move = MOVES.find(([key]) => isKey(press, key));
    if (move) {
      setSelected(moveSelection(rows, clamp(selectedRef.current), move[1]));
      return true;
    }
    if (isKey(press, "enter")) {
      open(entries[clamp(selectedRef.current)]);
      return true;
    }
    if (/^[1-9]$/.test(press.input) && !press.key.ctrl && !press.key.meta) {
      open(entries[Number(press.input) - 1]);
      return true;
    }
    return false;
  });

  const projectTitle = (entry: OverviewEntry) =>
    projects
      .find((group) => group.environmentId === entry.thread.environmentId)
      ?.projects.find((project) => project.id === entry.thread.projectId)?.title ?? "No project";

  // Lines: a header per section, then its card rows. Scroll the fewest lines that show the cursor.
  const blocks: Array<{ height: number; node: ReactNode }> = [];
  let index = 0;
  let cursorBlock = 0;
  for (const section of sections) {
    const gap = blocks.length > 0 ? 1 : 0;
    blocks.push({
      height: 1 + gap,
      node: (
        <Box key={section.group} marginTop={gap}>
          <Text bold color={theme.textMuted}>
            {section.title.toUpperCase()} · {section.entries.length}
          </Text>
        </Box>
      ),
    });
    for (let start = 0; start < section.entries.length; start += columns) {
      const first = index;
      const cards = section.entries.slice(start, start + columns);
      if (cursor >= first && cursor < first + cards.length) cursorBlock = blocks.length;
      blocks.push({
        height: CARD_HEIGHT,
        node: (
          <Box key={`${section.group}:${start}`}>
            {cards.map((entry, offset) => (
              <Card
                key={`${entry.thread.environmentId}:${entry.thread.id}`}
                entry={entry}
                group={section.group}
                index={first + offset}
                selected={first + offset === cursor}
                project={projectTitle(entry)}
                width={Math.floor(width / columns)}
                nowMs={nowMs}
              />
            ))}
          </Box>
        ),
      });
      index += cards.length;
    }
  }
  const bodyHeight = Math.max(1, height - 2);
  let top = 0;
  const linesThrough = (from: number) =>
    blocks.slice(from, cursorBlock + 1).reduce((sum, block) => sum + block.height, 0);
  while (top < cursorBlock && linesThrough(top) > bodyHeight) top += 1;
  const shown: ReactNode[] = [];
  let used = 0;
  for (const block of blocks.slice(top)) {
    if (used + block.height > bodyHeight) break;
    shown.push(block.node);
    used += block.height;
  }

  const needs = sections.find((s) => s.group === "needs")?.entries.length ?? 0;
  const working = sections.find((s) => s.group === "working")?.entries.length ?? 0;
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box>
        <Text bold color={theme.text}>
          Agents{"  "}
        </Text>
        <Text color={needs > 0 ? theme.warning : theme.textMuted}>{needs} need you</Text>
        <Text color={theme.textMuted}> · {working} working</Text>
        <Box flexGrow={1} />
        <Text wrap="truncate" color={theme.textFaint}>
          ←↓↑→/hjkl move · enter or 1-9 open · esc close
        </Text>
      </Box>
      <Text> </Text>
      {sections.length === 0 ? <Text color={theme.textMuted}>No active threads.</Text> : shown}
    </Box>
  );
}
