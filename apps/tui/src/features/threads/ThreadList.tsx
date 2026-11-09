import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Box, Text } from "ink";
import { useContext, useState } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { threadListAtom } from "./threadList.ts";

export function ThreadList({ focused, height }: TuiViewProps) {
  const registry = useContext(RegistryContext);
  const rows = useAtomValue(threadListAtom);
  const route = useAtomValue(routeAtom);
  const [cursor, setCursor] = useState(0);
  const selected = Math.min(cursor, Math.max(0, rows.length - 1));

  useRegionInput("sidebar", (press) => {
    if (isKey(press, "arrowdown") || isKey(press, "j"))
      setCursor(Math.min(selected + 1, rows.length - 1));
    else if (isKey(press, "arrowup") || isKey(press, "k")) setCursor(Math.max(selected - 1, 0));
    else if (isKey(press, "enter")) {
      const row = rows[selected];
      if (!row) return false;
      registry.set(routeAtom, {
        view: "thread",
        thread: { environmentId: row.environmentId, threadId: row.thread.id },
      });
    } else return false;
    return true;
  });

  if (rows.length === 0) return <Text color={theme.textFaint}>No threads yet.</Text>;
  const first = Math.max(0, Math.min(selected - Math.floor(height / 2), rows.length - height));
  return (
    <Box flexDirection="column">
      {rows.slice(first, first + height).map((row, offset) => {
        const index = first + offset;
        const open = route.thread?.threadId === row.thread.id;
        const running = row.thread.activeRunId !== null;
        return (
          <Box key={`${row.environmentId}:${row.thread.id}`}>
            <Text
              wrap="truncate"
              color={open ? theme.accent : theme.text}
              {...(focused && index === selected ? { backgroundColor: theme.selection } : {})}
            >
              {running ? "● " : "  "}
              {row.thread.title || "Untitled thread"}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
