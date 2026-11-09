import type { IBufferCell, Terminal } from "@xterm/headless";

import type { KeyPress } from "../../app/keys.ts";
import { theme } from "../../theme/theme.ts";

export interface Segment {
  readonly text: string;
  readonly color?: string;
  readonly backgroundColor?: string;
  readonly bold?: boolean;
  readonly dim?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
  readonly inverse?: boolean;
}

// Colors 0-7 and their bright twins 8-15 on theme tokens, as features/pr-panel/ansi.ts does.
const PALETTE = [
  theme.textFaint,
  theme.danger,
  theme.success,
  theme.warning,
  theme.info,
  theme.syntax.typesComponents,
  theme.syntax.regex,
  theme.text,
] as const;

const hex = (value: number) => `#${value.toString(16).padStart(6, "0")}`;

function paletteColor(index: number): string {
  if (index < 16) return PALETTE[index % 8]!;
  if (index >= 232) {
    const level = 8 + (index - 232) * 10;
    return hex(level * 0x10101);
  }
  const cube = index - 16;
  const level = (step: number) => (step === 0 ? 0 : 55 + step * 40);
  return hex(
    (level(Math.floor(cube / 36)) << 16) | (level(Math.floor(cube / 6) % 6) << 8) | level(cube % 6),
  );
}

// 256-color and RGB come from the program in the terminal, so they pass through as content.
function fg(cell: IBufferCell): string | undefined {
  if (cell.isFgPalette()) return paletteColor(cell.getFgColor());
  if (cell.isFgRGB()) return hex(cell.getFgColor());
  return undefined;
}

function bg(cell: IBufferCell): string | undefined {
  if (cell.isBgPalette()) return paletteColor(cell.getBgColor());
  if (cell.isBgRGB()) return hex(cell.getBgColor());
  return undefined;
}

function cellStyle(cell: IBufferCell, cursor: boolean): Omit<Segment, "text"> {
  const color = fg(cell);
  const backgroundColor = bg(cell);
  return {
    ...(color === undefined ? {} : { color }),
    ...(backgroundColor === undefined ? {} : { backgroundColor }),
    ...(cell.isBold() ? { bold: true } : {}),
    ...(cell.isDim() ? { dim: true } : {}),
    ...(cell.isItalic() ? { italic: true } : {}),
    ...(cell.isUnderline() ? { underline: true } : {}),
    ...(cell.isStrikethrough() ? { strikethrough: true } : {}),
    ...(Boolean(cell.isInverse()) !== cursor ? { inverse: true } : {}),
  };
}

const sameStyle = (left: Omit<Segment, "text">, right: Omit<Segment, "text">) =>
  left.color === right.color &&
  left.backgroundColor === right.backgroundColor &&
  left.bold === right.bold &&
  left.dim === right.dim &&
  left.italic === right.italic &&
  left.underline === right.underline &&
  left.strikethrough === right.strikethrough &&
  left.inverse === right.inverse;

/**
 * Styled rows of the emulator: `count` rows from buffer line `top`, cut to `width` cells.
 * `cursor` is the buffer line and column to draw inverted, if any.
 */
export function screenRows(
  term: Terminal,
  top: number,
  count: number,
  width: number,
  cursor: { readonly line: number; readonly column: number } | null,
): Segment[][] {
  const buffer = term.buffer.active;
  const cell = buffer.getNullCell();
  const rows: Segment[][] = [];
  for (let y = top; y < top + count; y++) {
    const line = buffer.getLine(y);
    const row: Segment[] = [];
    rows.push(row);
    if (line === undefined) continue;
    let used = 0;
    for (let x = 0; x < term.cols && used < width; x++) {
      line.getCell(x, cell);
      const cellWidth = cell.getWidth();
      if (cellWidth === 0) continue;
      if (used + cellWidth > width) break;
      used += cellWidth;
      const style = cellStyle(cell, cursor?.line === y && cursor.column === x);
      const text = cell.getChars() || " ";
      const last = row.at(-1);
      if (last !== undefined && sameStyle(last, style)) {
        row[row.length - 1] = { ...last, text: last.text + text };
      } else {
        row.push({ ...style, text });
      }
    }
    // Trailing blanks without a background or inversion only cost Ink work.
    const last = row.at(-1);
    if (last !== undefined && last.backgroundColor === undefined && last.inverse === undefined) {
      const text = last.text.trimEnd();
      if (text === "") row.pop();
      else row[row.length - 1] = { ...last, text };
    }
  }
  return rows;
}

const CURSOR_KEYS: ReadonlyArray<readonly [keyof KeyPress["key"], string]> = [
  ["upArrow", "A"],
  ["downArrow", "B"],
  ["rightArrow", "C"],
  ["leftArrow", "D"],
  ["home", "H"],
  ["end", "F"],
];

const TILDE_KEYS: ReadonlyArray<readonly [keyof KeyPress["key"], string]> = [
  ["pageUp", "5"],
  ["pageDown", "6"],
  ["delete", "3"],
];

/**
 * The bytes a terminal would send for an Ink key press. `applicationCursor` is the DECCKM
 * mode the program in the terminal asked for. Null when the press has no bytes.
 */
export function keyBytes(press: KeyPress, applicationCursor: boolean): string | null {
  const { input, key } = press;
  const modifier = 1 + (key.shift ? 1 : 0) + (key.meta ? 2 : 0) + (key.ctrl ? 4 : 0);
  for (const [name, final] of CURSOR_KEYS) {
    if (!key[name]) continue;
    if (modifier > 1) return `\x1b[1;${modifier}${final}`;
    return applicationCursor ? `\x1bO${final}` : `\x1b[${final}`;
  }
  for (const [name, code] of TILDE_KEYS) {
    if (key[name]) return modifier > 1 ? `\x1b[${code};${modifier}~` : `\x1b[${code}~`;
  }
  const meta = key.meta ? "\x1b" : "";
  if (key.return) return `${meta}\r`;
  if (key.tab) return key.shift ? "\x1b[Z" : `${meta}\t`;
  if (key.backspace) return `${meta}\x7f`;
  if (key.escape) return "\x1b";
  if (key.ctrl && input.length === 1) {
    const code = input.toLowerCase().charCodeAt(0);
    if (code >= 97 && code <= 122) return meta + String.fromCharCode(code - 96);
    if (input === " " || input === "@") return `${meta}\x00`;
    if (code >= 91 && code <= 95) return meta + String.fromCharCode(code - 64);
  }
  return input === "" ? null : meta + input;
}
