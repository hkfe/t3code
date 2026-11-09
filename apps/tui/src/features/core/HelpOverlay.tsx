import { RegistryContext } from "@effect/atom-react";
import { Box, Text } from "ink";
import { useContext, useMemo, useState } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { Frame, FRAME_Y } from "../../app/Frame.tsx";
import { useRegionInput } from "../../app/input.tsx";
import { helpRows } from "../../app/keymap.ts";
import { isKey } from "../../app/keys.ts";
import { keyCollisions, useShellRegistry } from "../../app/registry.ts";
import { theme } from "../../theme/theme.ts";
import { editText, TextField } from "../thread-actions/ui.tsx";

// Frame and query line.
const CHROME_ROWS = FRAME_Y + 1;
const KEY_WIDTH = 18;
const TITLE_WIDTH = 40;

/** Skipped user rules and keys that shadow each other; `when`s read the current atom state. */
function useKeymapIssues(): ReadonlyArray<string> {
  const registry = useContext(RegistryContext);
  const shell = useShellRegistry();
  return useMemo(
    () => [...shell.keybindingErrors, ...keyCollisions(shell, registry)],
    [shell, registry],
  );
}

export function KeymapStatus() {
  const issues = useKeymapIssues();
  if (issues.length === 0) return null;
  return (
    <Text color={theme.warning} wrap="truncate">
      keys: {issues[0]}
      {issues.length > 1 ? ` (+${issues.length - 1}, ? lists them)` : ""}
    </Text>
  );
}

/** Searchable list of every binding, generated from the registry. */
export function HelpOverlay({ width, height }: TuiViewProps) {
  const shell = useShellRegistry();
  const issues = useKeymapIssues();
  const [query, setQuery] = useState("");
  const [scroll, setScroll] = useState(0);
  const rows = helpRows(shell, query);
  const visible = Math.max(1, height - CHROME_ROWS - issues.length);
  const top = Math.max(0, Math.min(scroll, rows.length - visible));
  useRegionInput("overlay", (press) => {
    const by = isKey(press, "arrowdown")
      ? 1
      : isKey(press, "arrowup")
        ? -1
        : isKey(press, "pagedown")
          ? visible
          : isKey(press, "pageup")
            ? -visible
            : 0;
    if (by !== 0) {
      setScroll(Math.max(0, Math.min(top + by, rows.length - visible)));
      return true;
    }
    const next = editText(press, query);
    if (next === null) return false;
    setQuery(next);
    setScroll(0);
    return true;
  });
  return (
    <Frame
      focused
      width={width}
      height={height}
      title="Keys"
      hint="type to search · ↑↓ pgup pgdn scroll · esc close"
    >
      <TextField value={query} />
      {issues.map((issue) => (
        <Text key={issue} color={theme.warning} wrap="truncate">
          {issue}
        </Text>
      ))}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {rows.slice(top, top + visible).map((row, index) =>
          row.kind === "group" ? (
            <Text key={`${top + index}:${row.title}`} color={theme.textMuted} bold wrap="truncate">
              {row.title}
            </Text>
          ) : (
            <Box key={`${top + index}:${row.key}`} gap={1}>
              <Box width={KEY_WIDTH} flexShrink={0}>
                <Text color={theme.accent} wrap="truncate">
                  {row.key}
                </Text>
              </Box>
              <Box width={TITLE_WIDTH} flexShrink={1}>
                <Text color={theme.text} wrap="truncate">
                  {row.title}
                </Text>
              </Box>
              <Text color={theme.textFaint} wrap="truncate">
                {row.custom ? "keybindings.json" : row.leader ? row.feature : ""}
              </Text>
            </Box>
          ),
        )}
        {rows.length === 0 && <Text color={theme.textFaint}>No binding matches.</Text>}
      </Box>
    </Frame>
  );
}
