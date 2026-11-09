import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { minuteTick } from "@t3tools/client-runtime/clock";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { threadLabelsOf } from "@t3tools/contracts";
import { Box } from "ink";
import { useContext, useState, useSyncExternalStore } from "react";

import { Text } from "../../app/text.tsx";
import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { environmentThreadDetails } from "../../state/threads.ts";
import { environmentThreadShells } from "../../state/threadShells.ts";
import { overlayAtom, routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { projectsAtom, statusBadge } from "../sidebar/Sidebar.tsx";
import { relativeTime, resolveThreadStatus } from "../sidebar/sidebarModel.ts";
import { activityAt, lastMessagePreview, moveInGrid, switcherThreads } from "./switcherModel.ts";

export const SWITCHER_OVERLAY = "switcher";
const CARD_MIN_WIDTH = 38;
// Border plus seven content rows: project, title x2, branch, preview x2, status.
const CARD_HEIGHT = 9;
// Title and hint lines.
const CHROME_ROWS = 2;

const ref = (thread: EnvironmentThreadShell) => ({
  environmentId: thread.environmentId,
  threadId: thread.id,
});

/** Reads the thread detail, so only cards on screen subscribe to it. */
function Preview(props: { readonly thread: EnvironmentThreadShell }) {
  const items = useAtomValue(environmentThreadDetails.visibleTurnItemsAtom(ref(props.thread)));
  const preview = lastMessagePreview(items);
  if (preview === null) return <Text color={theme.textFaint}>No messages yet.</Text>;
  return (
    <Text color={theme.textMuted}>
      <Text color={theme.text}>{preview.author}: </Text>
      {preview.text}
    </Text>
  );
}

function Card(props: {
  readonly thread: EnvironmentThreadShell;
  readonly projectTitle: string | undefined;
  readonly number: number | null;
  readonly current: boolean;
  readonly selected: boolean;
  readonly width: number;
  readonly nowMs: number;
}) {
  const { thread } = props;
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(thread.environmentId));
  const labels = threadLabelsOf(thread.tags, settings?.threadLabels);
  const status = resolveThreadStatus(thread);
  const badge = status === "ready" ? null : statusBadge(thread, status, props.nowMs);
  return (
    <Box
      width={props.width}
      height={CARD_HEIGHT}
      flexDirection="column"
      borderStyle="round"
      borderColor={props.selected ? theme.borderFocused : theme.border}
      paddingX={1}
    >
      <Box gap={1}>
        {props.number !== null ? <Text color={theme.accent}>{props.number}</Text> : null}
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate" color={theme.textMuted}>
            {props.projectTitle ?? "No project"}
          </Text>
        </Box>
        <Text color={props.current ? theme.accent : theme.textFaint}>
          {props.current ? "Current" : relativeTime(activityAt(thread), props.nowMs)}
        </Text>
      </Box>
      <Box height={2} overflow="hidden">
        <Text bold color={theme.text}>
          {thread.title || "Untitled thread"}
        </Text>
      </Box>
      <Text wrap="truncate" color={theme.textFaint}>
        {thread.branch || " "}
      </Text>
      <Box height={2} overflow="hidden">
        <Preview thread={thread} />
      </Box>
      <Text wrap="truncate">
        {badge ? <Text color={badge.color}>● {badge.label} </Text> : null}
        {labels.map((label) => (
          <Text key={label.id} color={theme.label[label.color]}>
            {label.name}{" "}
          </Text>
        ))}
      </Text>
    </Box>
  );
}

/** Recent threads as cards: tab or arrows move, enter or 1-9 open, escape cancels. */
export function Switcher({ width, height }: TuiViewProps) {
  const registry = useContext(RegistryContext);
  const shells = useAtomValue(environmentThreadShells.quietThreadShellsAtom);
  const projects = useAtomValue(projectsAtom);
  const route = useAtomValue(routeAtom);
  const minute = useSyncExternalStore(minuteTick.subscribe, minuteTick.getSnapshot);
  const nowMs = Date.parse(`${minute}:00.000Z`);
  const threads = switcherThreads(shells, route.thread, new Date(nowMs).toISOString());
  const hasCurrent = route.thread !== null && threads[0]?.id === route.thread.threadId;
  // Like Alt+Tab, the first card past the open thread starts selected.
  const [cursor, setCursor] = useState(hasCurrent ? 1 : 0);
  const selected = Math.min(cursor, Math.max(0, threads.length - 1));

  const columns = Math.max(1, Math.floor(width / CARD_MIN_WIDTH));
  const cardWidth = Math.floor(width / columns);
  const visibleRows = Math.max(1, Math.floor((height - CHROME_ROWS) / CARD_HEIGHT));
  const selectedRow = Math.floor(selected / columns);
  const firstRow = Math.max(0, selectedRow - visibleRows + 1);
  const first = firstRow * columns;
  const visible = threads.slice(first, first + visibleRows * columns);

  const open = (thread: EnvironmentThreadShell | undefined) => {
    if (!thread) return;
    registry.set(overlayAtom, null);
    registry.set(routeAtom, { view: "thread", thread: ref(thread) });
  };
  const cycle = (step: 1 | -1) =>
    setCursor((selected + step + threads.length) % Math.max(1, threads.length));

  useRegionInput("overlay", (press) => {
    if (isKey(press, "tab") || isKey(press, "ctrl+]")) cycle(1);
    else if (isKey(press, "shift+tab")) cycle(-1);
    else if (isKey(press, "arrowleft"))
      setCursor(moveInGrid(selected, threads.length, columns, "left"));
    else if (isKey(press, "arrowright"))
      setCursor(moveInGrid(selected, threads.length, columns, "right"));
    else if (isKey(press, "arrowup"))
      setCursor(moveInGrid(selected, threads.length, columns, "up"));
    else if (isKey(press, "arrowdown"))
      setCursor(moveInGrid(selected, threads.length, columns, "down"));
    else if (isKey(press, "enter")) open(threads[selected]);
    else if (/^[1-9]$/.test(press.input) && !press.key.ctrl && !press.key.meta)
      open(visible[Number(press.input) - 1]);
    else return false;
    return true;
  });

  const projectTitles = new Map(
    projects.flatMap(({ environmentId, projects }) =>
      projects.map((project) => [`${environmentId}:${project.id}`, project.title] as const),
    ),
  );
  const rows = Array.from({ length: Math.ceil(visible.length / columns) }, (_, row) =>
    visible.slice(row * columns, (row + 1) * columns),
  );
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Text color={theme.textMuted} bold wrap="truncate">
        Switch thread <Text color={theme.textFaint}>{threads.length}</Text>
      </Text>
      {threads.length === 0 ? <Text color={theme.textFaint}>No recent threads.</Text> : null}
      <Box flexDirection="column" flexGrow={1}>
        {rows.map((cards, row) => (
          <Box key={cards[0]?.id ?? row}>
            {cards.map((thread, column) => {
              const index = first + row * columns + column;
              const offset = index - first;
              return (
                <Card
                  key={`${thread.environmentId}:${thread.id}`}
                  thread={thread}
                  projectTitle={projectTitles.get(`${thread.environmentId}:${thread.projectId}`)}
                  number={offset < 9 ? offset + 1 : null}
                  current={hasCurrent && index === 0}
                  selected={index === selected}
                  width={cardWidth}
                  nowMs={nowMs}
                />
              );
            })}
          </Box>
        ))}
      </Box>
      <Text color={theme.textFaint} wrap="truncate">
        tab/shift+tab or arrows move · enter open · 1-9 jump · esc cancel
      </Text>
    </Box>
  );
}
