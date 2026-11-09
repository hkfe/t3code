import { Box } from "ink";
import { useMemo, useRef, useState } from "react";

import { Text } from "../../app/text.tsx";
import { useRegionInput, type KeyHandler } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import type { Region } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { CHANGE_MARK, DiffView } from "./DiffView.tsx";
import { changeBar, listRows } from "./fileList.ts";
import type { DiffFile } from "./patch.ts";

export interface ViewedFiles {
  readonly isViewed: (path: string) => boolean;
  readonly setViewed: (path: string, viewed: boolean) => void;
}

/**
 * A file list with change markers, bars and viewed marks; `enter` opens a file's diff. Shared by
 * the PR Code tab and the thread's Changes view. `scope` names the diff range (commit, turn);
 * `onScope` cycles it with `c` / `C`.
 */
export function CodeBrowser({
  files,
  status,
  scope,
  onScope,
  viewed,
  onBack,
  region,
  width,
  height,
}: {
  readonly files: ReadonlyArray<DiffFile>;
  /** Loading or error text; shown instead of an empty list. */
  readonly status: string | null;
  readonly scope: string;
  readonly onScope?: (step: 1 | -1) => void;
  readonly viewed: ViewedFiles;
  /** `escape` in the file list; without it the key goes on to the shell. */
  readonly onBack?: () => void;
  readonly region: Region;
  readonly width: number;
  readonly height: number;
}) {
  const [tree, setTree] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const diffKeys = useRef<KeyHandler | null>(null);
  const rows = useMemo(() => listRows(files, tree), [files, tree]);
  const fileRows = rows.flatMap((row, index) => (row.type === "file" ? [index] : []));
  const found = rows.findIndex((row) => row.type === "file" && row.file.path === selectedPath);
  const selected = found === -1 ? (fileRows[0] ?? -1) : found;
  const selectedRow = rows[selected];
  const selectedFile = selectedRow?.type === "file" ? selectedRow.file : null;
  const largest = Math.max(0, ...files.map((file) => file.additions + file.deletions));
  const viewedCount = files.filter((file) => viewed.isViewed(file.path)).length;

  const moveFile = (step: number) => {
    const position = fileRows.indexOf(selected) + step;
    const row = rows[fileRows[Math.max(0, Math.min(position, fileRows.length - 1))] ?? -1];
    if (row?.type === "file") setSelectedPath(row.file.path);
  };
  const toggleViewed = () => {
    if (selectedFile !== null)
      viewed.setViewed(selectedFile.path, !viewed.isViewed(selectedFile.path));
  };

  useRegionInput(region, (press) => {
    if (open) {
      if (diffKeys.current?.(press)) return true;
      if (isKey(press, "escape") || isKey(press, "backspace") || press.input === "h")
        setOpen(false);
      else if (press.input === "J") moveFile(1);
      else if (press.input === "K") moveFile(-1);
      else if (press.input === "v") toggleViewed();
      else return false;
      return true;
    }
    if (isKey(press, "j") || isKey(press, "arrowdown")) moveFile(1);
    else if (isKey(press, "k") || isKey(press, "arrowup")) moveFile(-1);
    else if (press.input === "g") moveFile(-fileRows.length);
    else if (press.input === "G") moveFile(fileRows.length);
    else if ((isKey(press, "enter") || press.input === "l") && selectedFile !== null) setOpen(true);
    else if (press.input === " " || press.input === "v") toggleViewed();
    else if (press.input === "t") setTree(!tree);
    else if (press.input === "c" && onScope) onScope(1);
    else if (press.input === "C" && onScope) onScope(-1);
    else if (isKey(press, "escape") && onBack) onBack();
    else return false;
    return true;
  });

  if (open && selectedFile !== null)
    return (
      <DiffView
        key={selectedFile.path}
        file={selectedFile}
        keys={(handler) => {
          diffKeys.current = handler;
        }}
        width={width}
        height={height}
      />
    );

  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const listHeight = Math.max(1, height - 1);
  const top = Math.max(
    0,
    Math.min(selected - Math.floor(listHeight / 2), rows.length - listHeight),
  );

  return (
    <Box flexDirection="column" height={height}>
      <Text wrap="truncate">
        <Text
          color={viewedCount === files.length && files.length > 0 ? theme.success : theme.text}
          bold
        >
          {`${viewedCount}/${files.length} viewed`}
        </Text>
        <Text color={theme.textMuted}>{`  ${scope}`}</Text>
        <Text color={theme.success}>{`  +${additions}`}</Text>
        <Text color={theme.danger}>{` -${deletions}`}</Text>
        <Text color={theme.textFaint}>{onScope ? "  c scope · t tree" : "  t tree"}</Text>
      </Text>
      {status !== null && files.length === 0 ? (
        <Text color={theme.textFaint}>{status}</Text>
      ) : (
        rows.slice(top, top + listHeight).map((row, offset) => {
          const index = top + offset;
          if (row.type === "dir")
            return (
              <Text key={`d:${row.path}`} color={theme.textFaint} wrap="truncate">
                {`  ▾ ${row.path}`}
              </Text>
            );
          const isViewed = viewed.isViewed(row.file.path);
          const mark = CHANGE_MARK[row.file.change];
          const bar = changeBar(row.file, largest);
          return (
            <Box key={row.file.path} height={1}>
              <Box flexGrow={1} overflow="hidden">
                <Text wrap="truncate">
                  <Text color={theme.accent}>{index === selected ? "▌" : " "}</Text>
                  <Text color={isViewed ? theme.success : theme.textFaint}>
                    {isViewed ? "✓ " : "○ "}
                  </Text>
                  <Text color={mark.color}>{mark.char} </Text>
                  {tree ? "  " : ""}
                  <Text color={isViewed ? theme.textMuted : theme.text} bold={!isViewed}>
                    {row.name}
                  </Text>
                  {tree ? null : <Text color={theme.textFaint}>{`  ${row.dir}`}</Text>}
                </Text>
              </Box>
              <Text>
                <Text color={theme.success}>{` +${row.file.additions}`}</Text>
                <Text color={theme.danger}>{` -${row.file.deletions} `}</Text>
                <Text color={theme.success}>{"■".repeat(bar.add)}</Text>
                <Text color={theme.danger}>{"■".repeat(bar.del)}</Text>
                <Text color={theme.border}>{"■".repeat(bar.rest)}</Text>
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
