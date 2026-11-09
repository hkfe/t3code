import { Box } from "ink";
import { useState, type ReactNode } from "react";

import { Text } from "../../app/text.tsx";
import type { KeyPress } from "../../app/keys.ts";
import { isKey } from "../../app/keys.ts";
import { theme } from "../../theme/theme.ts";
import type { MenuItem } from "./menu.ts";

const DIALOG_WIDTH = 60;
// Border, title, hint and error lines around the rows.
const DIALOG_CHROME_ROWS = 6;

export function Dialog(props: {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly hint: string;
  readonly error?: string | null;
  readonly children: ReactNode;
}) {
  return (
    <Box width={props.width} height={props.height} justifyContent="center" alignItems="center">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.borderFocused}
        paddingX={1}
        width={Math.min(DIALOG_WIDTH, props.width)}
      >
        <Text color={theme.textMuted} bold wrap="truncate">
          {props.title}
        </Text>
        {props.children}
        {props.error ? (
          <Text color={theme.danger} wrap="truncate">
            {props.error}
          </Text>
        ) : null}
        <Text color={theme.textFaint} wrap="truncate">
          {props.hint}
        </Text>
      </Box>
    </Box>
  );
}

/** Rows that fit the dialog, scrolled to keep the cursor visible. */
export function MenuRows(props: {
  readonly items: ReadonlyArray<MenuItem>;
  readonly cursor: number;
  readonly height: number;
}) {
  const visible = Math.max(1, props.height - DIALOG_CHROME_ROWS);
  const first = Math.max(0, Math.min(props.cursor - visible + 1, props.items.length - visible));
  return props.items.slice(first, first + visible).map((item, offset) => {
    const selected = first + offset === props.cursor;
    return (
      <Box key={item.id} gap={1}>
        {item.checked !== undefined && (
          <Text color={theme.accent}>{item.checked ? "[x]" : "[ ]"}</Text>
        )}
        {item.color !== undefined && <Text color={item.color}>●</Text>}
        <Text
          wrap="truncate"
          color={item.disabled ? theme.textFaint : theme.text}
          {...(selected ? { backgroundColor: theme.selection } : {})}
        >
          {item.label}
        </Text>
      </Box>
    );
  });
}

/** j/k and arrows move; returns the cursor and a key handler that reports if it moved. */
export function useListCursor(length: number) {
  const [cursor, setCursor] = useState(0);
  const selected = Math.min(cursor, Math.max(0, length - 1));
  const move = (press: KeyPress) => {
    if (isKey(press, "arrowdown") || isKey(press, "j"))
      setCursor(Math.min(selected + 1, length - 1));
    else if (isKey(press, "arrowup") || isKey(press, "k")) setCursor(Math.max(selected - 1, 0));
    else return false;
    return true;
  };
  return [selected, move] as const;
}

/** The edited value for a typing key, or null for keys a text field leaves alone. */
export function editText(press: KeyPress, value: string): string | null {
  if (press.key.backspace || press.key.delete) return value.slice(0, -1);
  if (press.key.ctrl || press.key.meta || press.key.escape || press.key.return) return null;
  if (press.key.tab || press.input.length === 0 || press.input < " ") return null;
  return value + press.input;
}

export function TextField({ value }: { readonly value: string }) {
  return (
    <Text color={theme.text} wrap="truncate-start">
      {"› "}
      {value}
      <Text color={theme.accent}>▏</Text>
    </Text>
  );
}
