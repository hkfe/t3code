import { useAtomValue } from "@effect/atom-react";
import type { OrchestrationV2ProjectedTurnItem, ScopedThreadRef } from "@t3tools/contracts";
import { Box, Text } from "ink";
import { useState } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { environmentThreadDetails } from "../../state/threads.ts";
import { routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";

function Item({ item }: { readonly item: OrchestrationV2ProjectedTurnItem["item"] }) {
  switch (item.type) {
    case "user_message":
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.accent} bold>
            you
          </Text>
          <Text color={theme.text}>{item.text}</Text>
        </Box>
      );
    case "assistant_message":
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.info} bold>
            agent{item.streaming ? " …" : ""}
          </Text>
          <Text color={theme.text}>{item.text}</Text>
        </Box>
      );
    default:
      return <Text color={theme.textFaint}>· {item.type.replaceAll("_", " ")}</Text>;
  }
}

function Messages({
  thread,
  height,
}: {
  readonly thread: ScopedThreadRef;
  readonly height: number;
}) {
  const items = useAtomValue(environmentThreadDetails.visibleTurnItemsAtom(thread));
  const title = useAtomValue(environmentThreadDetails.threadAtom(thread))?.projection.thread.title;
  // ponytail: scrolls by whole items, not lines; the chat wave replaces this with a line scroller.
  const [fromEnd, setFromEnd] = useState(0);

  useRegionInput("main", (press) => {
    if (isKey(press, "arrowup") || isKey(press, "k"))
      setFromEnd(Math.min(fromEnd + 1, items.length - 1));
    else if (isKey(press, "arrowdown") || isKey(press, "j")) setFromEnd(Math.max(fromEnd - 1, 0));
    else if (isKey(press, "end")) setFromEnd(0);
    else return false;
    return true;
  });

  const shown = items.slice(0, items.length - fromEnd);
  return (
    <Box flexDirection="column" height={height}>
      <Text color={theme.textMuted} bold wrap="truncate">
        {title ?? "Loading thread…"}
      </Text>
      <Box flexDirection="column" flexGrow={1} justifyContent="flex-end" overflow="hidden">
        {shown.map((row) => (
          <Item key={row.item.id} item={row.item} />
        ))}
      </Box>
    </Box>
  );
}

export function ThreadView({ height }: TuiViewProps) {
  const thread = useAtomValue(routeAtom).thread;
  if (thread === null) return <Text color={theme.textFaint}>Select a thread.</Text>;
  return (
    <Messages key={`${thread.environmentId}:${thread.threadId}`} thread={thread} height={height} />
  );
}
