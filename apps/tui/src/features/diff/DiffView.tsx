import { useAtom } from "@effect/atom-react";
import { Box } from "ink";
import { useEffect, useMemo, useState } from "react";

import { Text } from "../../app/text.tsx";
import type { KeyHandler } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { theme } from "../../theme/theme.ts";
import type { Line } from "../thread-view/lines.ts";
import { createHighlighter, languageOf, paintSide } from "./paint.ts";
import type { ChangeType, DiffFile } from "./patch.ts";
import { buildRows, type Row, type Side } from "./rows.ts";
import { diffWrapAtom } from "./state.ts";

/** Side-by-side needs two readable halves. */
const SPLIT_MIN_WIDTH = 110;

export const CHANGE_MARK: Record<ChangeType, { readonly char: string; readonly color: string }> = {
  added: { char: "A", color: theme.success },
  modified: { char: "M", color: theme.warning },
  deleted: { char: "D", color: theme.danger },
  renamed: { char: "R", color: theme.info },
};

function Spans({ line }: { readonly line: Line }) {
  return line.map((part, index) => (
    <Text
      // oxlint-disable-next-line react/no-array-index-key -- spans of a line are positional and never reorder
      key={index}
      color={part.color ?? theme.text}
      {...(part.backgroundColor === undefined ? {} : { backgroundColor: part.backgroundColor })}
      italic={part.italic === true}
    >
      {part.text}
    </Text>
  ));
}

const SIGN = { add: "+", del: "-", context: " ", empty: " " } as const;
const SIGN_COLOR = {
  add: theme.success,
  del: theme.danger,
  context: theme.textFaint,
  empty: theme.textFaint,
};

function lineNumber(value: number | null, digits: number, show: boolean) {
  return (show && value !== null ? String(value) : "").padStart(digits);
}

/**
 * One file's diff: unified, or side by side when wide. It hands its key handler to `keys`; the
 * owner calls it first, so a handler registered after the owner (a PR panel) cannot take its keys.
 */
export function DiffView({
  file,
  keys,
  width,
  height,
}: {
  readonly file: DiffFile;
  readonly keys: (handler: KeyHandler | null) => void;
  readonly width: number;
  readonly height: number;
}) {
  const [wrap, setWrap] = useAtom(diffWrapAtom);
  const [expanded, setExpanded] = useState(false);
  const [top, setTop] = useState(0);
  const highlighter = useMemo(() => createHighlighter(languageOf(file.path)), [file.path]);

  const split = width >= SPLIT_MIN_WIDTH;
  const digits = String(
    Math.max(
      1,
      ...file.hunks.map((hunk) => Math.max(hunk.oldStart, hunk.newStart) + hunk.lines.length),
    ),
  ).length;
  // Unified: "old new ± ". Split: "no ± " per half, one separator column.
  const textWidth = split
    ? Math.max(4, Math.floor((width - 1) / 2) - digits - 3)
    : Math.max(4, width - digits * 2 - 4);
  const { rows, hunkStarts } = useMemo(
    () => buildRows(file, { split, textWidth, wrap, expanded }),
    [file, split, textWidth, wrap, expanded],
  );
  const bodyHeight = Math.max(1, height - 1);
  const maxTop = Math.max(0, rows.length - bodyHeight);
  const scrollTop = Math.min(top, maxTop);
  const scrollTo = (next: number) => setTop(Math.max(0, Math.min(next, maxTop)));

  const handle: KeyHandler = (press) => {
    const half = Math.max(1, Math.floor(bodyHeight / 2));
    if (isKey(press, "j") || isKey(press, "arrowdown")) scrollTo(scrollTop + 1);
    else if (isKey(press, "k") || isKey(press, "arrowup")) scrollTo(scrollTop - 1);
    else if (isKey(press, "ctrl+d") || isKey(press, "pagedown")) scrollTo(scrollTop + half);
    else if (isKey(press, "ctrl+u") || isKey(press, "pageup")) scrollTo(scrollTop - half);
    else if (press.input === "g") scrollTo(0);
    else if (press.input === "G") scrollTo(maxTop);
    else if (press.input === "n")
      scrollTo(hunkStarts.find((start) => start > scrollTop) ?? scrollTop);
    else if (press.input === "p") scrollTo(hunkStarts.findLast((start) => start < scrollTop) ?? 0);
    else if (press.input === "w") setWrap(!wrap);
    else if (press.input === "x") setExpanded(!expanded);
    else return false;
    return true;
  };
  useEffect(() => {
    keys(handle);
    return () => keys(null);
  });

  const mark = CHANGE_MARK[file.change];
  const title = file.change === "renamed" ? `${file.oldPath} → ${file.path}` : file.path;
  const half = Math.floor((width - 1) / 2);

  const side = (cell: Side, numbering: "both" | "old" | "new", key: string) => {
    const kind = cell.kind;
    const show = !cell.cont;
    const oldNo = lineNumber(cell.line?.oldNo ?? null, digits, show);
    const newNo = lineNumber(cell.line?.newNo ?? null, digits, show);
    const numbers =
      numbering === "both" ? `${oldNo} ${newNo}` : numbering === "old" ? oldNo : newNo;
    const text =
      cell.line === null
        ? [{ text: " ".repeat(textWidth) }]
        : paintSide(highlighter(cell.line.text), cell, textWidth);
    return (
      <Text key={key} wrap="truncate">
        <Text color={theme.textFaint}>{numbers} </Text>
        <Text color={SIGN_COLOR[kind]}>{cell.cont ? " " : SIGN[kind]} </Text>
        <Spans line={text} />
      </Text>
    );
  };

  const renderRow = (row: Row, index: number) => {
    if (row.type === "hunk")
      return (
        <Text key={index} color={theme.info} wrap="truncate">
          {row.text}
        </Text>
      );
    if (row.type === "fold")
      return (
        <Text key={index} color={theme.textFaint} wrap="truncate">
          {`  ⋯ ${row.count} unchanged lines · x to expand`}
        </Text>
      );
    if (row.right === null)
      return (
        <Text key={index} wrap="truncate">
          {side(row.left, "both", "u")}
        </Text>
      );
    return (
      <Box key={index} height={1}>
        <Box width={half} overflow="hidden">
          {side(row.left, "old", "l")}
        </Box>
        <Text color={theme.border}>│</Text>
        <Box width={width - half - 1} overflow="hidden">
          {side(row.right, "new", "r")}
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" height={height}>
      <Text wrap="truncate">
        <Text color={mark.color} bold>
          {mark.char}{" "}
        </Text>
        <Text color={theme.text} bold>
          {title}
        </Text>
        <Text color={theme.success}>{`  +${file.additions}`}</Text>
        <Text color={theme.danger}>{` -${file.deletions}`}</Text>
        <Text color={theme.textFaint}>
          {`  ${split ? "split" : "unified"}${wrap ? " · wrap" : ""}${rows.length > bodyHeight ? ` · ${Math.round(((scrollTop + bodyHeight) / rows.length) * 100)}%` : ""}`}
        </Text>
      </Text>
      {file.binary || file.hunks.length === 0 ? (
        <Text color={theme.textFaint}>
          {file.binary ? "Binary file not shown." : "No line changes."}
        </Text>
      ) : (
        rows
          .slice(scrollTop, scrollTop + bodyHeight)
          .map((row, index) => renderRow(row, scrollTop + index))
      )}
    </Box>
  );
}
