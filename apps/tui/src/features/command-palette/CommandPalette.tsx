import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { splitSearchText, type SearchRange } from "@t3tools/shared/paletteSearch";
import { Atom } from "effect/reactivity";
import { Box, useApp, usePaste } from "ink";
import { useContext, useEffect, useMemo, useState } from "react";

import { Text } from "../../app/text.tsx";
import type { PaletteItem, TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { displayKey, isKey } from "../../app/keys.ts";
import { useShellRegistry, type ShellRegistry } from "../../app/registry.ts";
import { overlayAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { addRecentPick, rankPalette, recentPicksAtom, type PaletteGroup } from "./palette.ts";

const SEARCH_DEBOUNCE_MS = 120;
const LABEL_WIDTH = 9;
// Border, query line, and footer.
const CHROME_ROWS = 4;
// Rows that only manage the palette itself.
const HIDDEN_COMMANDS = new Set(["commandPalette.toggle", "core.closeOverlay", "core.leader"]);

function commandItems(shell: ShellRegistry): ReadonlyArray<PaletteItem> {
  return [...shell.commands.values()]
    .filter((command) => !HIDDEN_COMMANDS.has(command.id))
    .map((command) => {
      const binding = shell.keybindings.find((entry) => entry.command === command.id);
      return {
        id: command.id,
        title: command.title,
        keywords: [command.id],
        ...(binding ? { hint: displayKey(binding.key, shell.leaderKey) } : {}),
        run: command.run,
      };
    });
}

function Highlighted(props: {
  readonly text: string;
  readonly ranges: ReadonlyArray<SearchRange>;
  readonly color: string;
}) {
  return splitSearchText(props.text, props.ranges).map((part) => (
    <Text
      key={part.start}
      color={part.highlighted ? theme.accent : props.color}
      bold={part.highlighted}
    >
      {part.text}
    </Text>
  ));
}

export function CommandPalette({ width, height }: TuiViewProps) {
  const registry = useContext(RegistryContext);
  const shell = useShellRegistry();
  const { exit } = useApp();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const recents = useAtomValue(recentPicksAtom);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const groupsAtom = useMemo(() => {
    const commands: PaletteGroup = {
      source: { id: "commands", label: "Command" },
      items: commandItems(shell),
    };
    return Atom.make((get): ReadonlyArray<PaletteGroup> => [
      commands,
      ...shell.paletteSources.map((source) => ({
        source,
        items: source.items(get, source.search ? searchQuery : ""),
      })),
    ]);
  }, [shell, searchQuery]);
  const groups = useAtomValue(groupsAtom);
  const rows = rankPalette(groups, query, recents);
  const selected = Math.min(cursor, Math.max(0, rows.length - 1));

  const edit = (next: string) => {
    setQuery(next);
    setCursor(0);
  };
  const run = () => {
    const row = rows[selected];
    if (!row) return;
    registry.set(overlayAtom, null);
    registry.set(recentPicksAtom, addRecentPick(recents, row.key));
    row.item.run({ registry, exit });
  };

  usePaste((text) => edit(query + text.replace(/\s+/g, " ")));

  useRegionInput("overlay", (press) => {
    if (isKey(press, "arrowdown") || isKey(press, "ctrl+n")) {
      setCursor(Math.min(selected + 1, rows.length - 1));
    } else if (isKey(press, "arrowup") || isKey(press, "ctrl+p")) {
      setCursor(Math.max(selected - 1, 0));
    } else if (isKey(press, "enter")) {
      run();
    } else if (press.key.backspace || press.key.delete) {
      edit(Array.from(query).slice(0, -1).join(""));
    } else if (isKey(press, "ctrl+u")) {
      edit("");
    } else if (
      press.input !== "" &&
      !press.key.ctrl &&
      !press.key.meta &&
      !/[\u0000-\u001f\u007f]/.test(press.input)
    ) {
      edit(query + press.input);
    } else {
      return false;
    }
    return true;
  });

  const listHeight = Math.max(1, height - CHROME_ROWS);
  const first = Math.max(
    0,
    Math.min(selected - Math.floor(listHeight / 2), rows.length - listHeight),
  );
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor={theme.borderFocused}
      paddingX={1}
      overflow="hidden"
    >
      <Text wrap="truncate">
        <Text color={theme.accent}>{"> "}</Text>
        <Text color={theme.text}>{query}</Text>
        <Text inverse> </Text>
        {query === "" && <Text color={theme.textFaint}> Search commands, threads, projects</Text>}
      </Text>
      <Box flexDirection="column" height={listHeight} overflow="hidden">
        {rows.length === 0 && <Text color={theme.textFaint}>No matches.</Text>}
        {rows.slice(first, first + listHeight).map((row, offset) => {
          const active = first + offset === selected;
          return (
            <Box key={row.key} gap={1} {...(active ? { backgroundColor: theme.selection } : {})}>
              <Box width={LABEL_WIDTH} flexShrink={0}>
                <Text color={theme.textFaint}>{row.label}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="truncate">
                  <Highlighted text={row.item.title} ranges={row.titleRanges} color={theme.text} />
                  {row.item.detail && (
                    <>
                      <Text color={theme.textFaint}> · </Text>
                      <Highlighted
                        text={row.item.detail}
                        ranges={row.detailRanges}
                        color={theme.textMuted}
                      />
                    </>
                  )}
                </Text>
              </Box>
              {row.item.hint && (
                <Box flexShrink={0}>
                  <Text color={theme.accent}>{row.item.hint}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      <Text color={theme.textFaint} wrap="truncate">
        ↑↓ ctrl+n/p move · enter run · ctrl+u clear · esc close
      </Text>
    </Box>
  );
}
