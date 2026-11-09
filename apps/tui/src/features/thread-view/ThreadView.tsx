import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { Box, Text } from "ink";
import { useContext, useMemo, useState } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { messageSelectionAtom } from "../../state/messageSelection.ts";
import { environmentThreadDetails } from "../../state/threads.ts";
import { usePaneRoute } from "../../state/panes.ts";
import { theme } from "../../theme/theme.ts";
import { blockMessageId, buildBlocks, isExpandable, renderBlock } from "./blocks.ts";
import type { Line } from "./lines.ts";
import {
  blockAt,
  layoutBlocks,
  railCells,
  visibleLines,
  type LineCache,
  type RailCell,
} from "./layout.ts";

const GUTTER = 2;
const RAIL = 2;

const RAIL_GLYPH: Record<RailCell, { readonly char: string; readonly color: string }> = {
  track: { char: "│", color: theme.border },
  band: { char: "┃", color: theme.textMuted },
  tick: { char: "•", color: theme.accent },
  bandTick: { char: "●", color: theme.accent },
};

function Row({ line }: { readonly line: Line }) {
  return (
    <>
      {line.map((part, index) => (
        <Text
          // oxlint-disable-next-line react/no-array-index-key -- spans of a line are positional and never reorder
          key={index}
          {...(part.color ? { color: part.color } : {})}
          {...(part.backgroundColor ? { backgroundColor: part.backgroundColor } : {})}
          bold={part.bold ?? false}
          italic={part.italic ?? false}
          underline={part.underline ?? false}
          strikethrough={part.strikethrough ?? false}
        >
          {part.text}
        </Text>
      ))}
    </>
  );
}

interface Scroll {
  /** Stick to the bottom while new lines arrive. */
  readonly follow: boolean;
  readonly top: number;
  /** Block count when follow turned off, for the "new messages" hint. */
  readonly seen: number;
}

function Messages({
  thread,
  width,
  height,
}: {
  readonly thread: ScopedThreadRef;
  readonly width: number;
  readonly height: number;
}) {
  const registry = useContext(RegistryContext);
  const rows = useAtomValue(environmentThreadDetails.visibleTurnItemsAtom(thread));
  const title = useAtomValue(environmentThreadDetails.threadAtom(thread))?.projection.thread.title;
  const selection = useAtomValue(messageSelectionAtom);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [cache] = useState<LineCache>(() => new Map());
  const [scroll, setScroll] = useState<Scroll>({ follow: true, top: 0, seen: 0 });

  const contentWidth = Math.max(8, width - GUTTER - RAIL);
  const bodyHeight = Math.max(1, height - 1);
  const blocks = useMemo(() => buildBlocks(rows), [rows]);
  const layout = useMemo(
    () => layoutBlocks(blocks, contentWidth, expanded, cache, renderBlock),
    [blocks, contentWidth, expanded, cache],
  );
  const maxTop = Math.max(0, layout.total - bodyHeight);
  const top = scroll.follow ? maxTop : Math.min(scroll.top, maxTop);
  const selectedId = selection?.thread.threadId === thread.threadId ? selection.itemId : null;
  const selected = selectedId === null ? -1 : blocks.findIndex((block) => block.id === selectedId);

  const scrollTo = (next: number) => {
    const clamped = Math.max(0, Math.min(next, maxTop));
    setScroll(
      clamped >= maxTop
        ? { follow: true, top: clamped, seen: blocks.length }
        : { follow: false, top: clamped, seen: scroll.follow ? blocks.length : scroll.seen },
    );
  };

  // Scroll a new selection into view, also when another feature selects a message.
  const [revealed, setRevealed] = useState(selectedId);
  if (selectedId !== revealed) {
    setRevealed(selectedId);
    if (selected !== -1) {
      const start = layout.starts[selected]!;
      const end = start + layout.lines[selected]!.length;
      if (start < top) scrollTo(start);
      else if (end > top + bodyHeight) scrollTo(Math.min(start, end - bodyHeight));
    }
  }

  const select = (index: number) => {
    const block = blocks[index];
    if (!block) return;
    registry.set(messageSelectionAtom, {
      thread,
      itemId: block.id,
      messageId: blockMessageId(block),
    });
  };

  useRegionInput("main", (press) => {
    const half = Math.max(1, Math.floor(bodyHeight / 2));
    if (isKey(press, "arrowdown") || isKey(press, "j")) scrollTo(top + 1);
    else if (isKey(press, "arrowup") || isKey(press, "k")) scrollTo(top - 1);
    else if (isKey(press, "ctrl+d")) scrollTo(top + half);
    else if (isKey(press, "ctrl+u")) scrollTo(top - half);
    else if (isKey(press, "pagedown")) scrollTo(top + bodyHeight);
    else if (isKey(press, "pageup")) scrollTo(top - bodyHeight);
    else if (press.input === "g" || isKey(press, "home")) scrollTo(0);
    else if (press.input === "G" || isKey(press, "end")) scrollTo(maxTop);
    else if (press.input === "]")
      select(selected === -1 ? blockAt(layout, top) : Math.min(selected + 1, blocks.length - 1));
    else if (press.input === "[")
      select(selected === -1 ? blockAt(layout, top + bodyHeight - 1) : Math.max(selected - 1, 0));
    else if ((isKey(press, "enter") || press.input === " ") && selected !== -1) {
      const block = blocks[selected]!;
      if (!isExpandable(block)) return false;
      const next = new Set(expanded);
      if (!next.delete(block.id)) next.add(block.id);
      setExpanded(next);
    } else if (isKey(press, "escape") && selected !== -1) registry.set(messageSelectionAtom, null);
    else return false;
    return true;
  });

  const visible = visibleLines(layout, top, bodyHeight);
  const rail =
    layout.total > bodyHeight ? railCells(layout.total, bodyHeight, top, layout.turns) : null;
  const hint = !scroll.follow && blocks.length > scroll.seen;

  return (
    <Box flexDirection="column" height={height}>
      <Text color={theme.textMuted} bold wrap="truncate">
        {title ?? "Loading thread…"}
      </Text>
      {Array.from({ length: bodyHeight }, (_, row) => {
        const entry = visible[row];
        const isHint = hint && row === bodyHeight - 1;
        const cell = rail?.[row];
        return (
          <Box key={row} height={1}>
            <Box width={width - RAIL} overflow="hidden">
              {isHint ? (
                <Text color={theme.accent} bold wrap="truncate">
                  {"  ↓ new messages · G to jump"}
                </Text>
              ) : entry ? (
                <Text wrap="truncate">
                  <Text color={theme.accent}>{entry.block === selected ? "▌ " : "  "}</Text>
                  <Row line={entry.line} />
                </Text>
              ) : null}
            </Box>
            <Text color={cell ? RAIL_GLYPH[cell].color : theme.border}>
              {" "}
              {cell ? RAIL_GLYPH[cell].char : " "}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

export function ThreadView({ width, height }: TuiViewProps) {
  const thread = usePaneRoute().thread;
  if (thread === null) return <Text color={theme.textFaint}>Select a thread.</Text>;
  return (
    <Messages
      key={`${thread.environmentId}:${thread.threadId}`}
      thread={thread}
      width={width}
      height={height}
    />
  );
}
