/** The draft text and the cursor, a UTF-16 offset into it. */
export interface EditorState {
  readonly text: string;
  readonly cursor: number;
}

export const EMPTY_EDITOR: EditorState = { text: "", cursor: 0 };

const WORD = /[\p{L}\p{N}_]/u;

export function insertText(state: EditorState, value: string): EditorState {
  const clean = value.replace(/\r\n?/g, "\n");
  return {
    text: state.text.slice(0, state.cursor) + clean + state.text.slice(state.cursor),
    cursor: state.cursor + clean.length,
  };
}

function deleteRange(state: EditorState, from: number, to: number): EditorState {
  if (from === to) return state;
  return { text: state.text.slice(0, from) + state.text.slice(to), cursor: from };
}

/** Steps over a whole surrogate pair, so an emoji is one keypress. */
function previousOffset(text: string, offset: number): number {
  if (offset <= 0) return 0;
  const low = text.charCodeAt(offset - 1);
  return low >= 0xdc00 && low <= 0xdfff && offset >= 2 ? offset - 2 : offset - 1;
}

function nextOffset(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  const high = text.charCodeAt(offset);
  return high >= 0xd800 && high <= 0xdbff && offset + 2 <= text.length ? offset + 2 : offset + 1;
}

function wordStart(text: string, offset: number): number {
  let index = offset;
  while (index > 0 && !WORD.test(text[index - 1]!)) index--;
  while (index > 0 && WORD.test(text[index - 1]!)) index--;
  return index;
}

function wordEnd(text: string, offset: number): number {
  let index = offset;
  while (index < text.length && !WORD.test(text[index]!)) index++;
  while (index < text.length && WORD.test(text[index]!)) index++;
  return index;
}

const lineStart = (text: string, offset: number) => text.lastIndexOf("\n", offset - 1) + 1;
function lineEnd(text: string, offset: number): number {
  const end = text.indexOf("\n", offset);
  return end === -1 ? text.length : end;
}

export type EditorMove =
  | "left"
  | "right"
  | "wordLeft"
  | "wordRight"
  | "home"
  | "end"
  | "backspace"
  | "delete"
  | "deleteWordBack"
  | "deleteToLineStart";

export function applyMove(state: EditorState, move: EditorMove): EditorState {
  const { text, cursor } = state;
  switch (move) {
    case "left":
      return { text, cursor: previousOffset(text, cursor) };
    case "right":
      return { text, cursor: nextOffset(text, cursor) };
    case "wordLeft":
      return { text, cursor: wordStart(text, cursor) };
    case "wordRight":
      return { text, cursor: wordEnd(text, cursor) };
    case "home":
      return { text, cursor: lineStart(text, cursor) };
    case "end":
      return { text, cursor: lineEnd(text, cursor) };
    case "backspace":
      return deleteRange(state, previousOffset(text, cursor), cursor);
    case "delete":
      return deleteRange(state, cursor, nextOffset(text, cursor));
    case "deleteWordBack":
      return deleteRange(state, wordStart(text, cursor), cursor);
    case "deleteToLineStart":
      return deleteRange(state, lineStart(text, cursor), cursor);
  }
}

/** Moves one logical line up or down, keeping the column; null at the first or last line. */
export function moveLine(state: EditorState, direction: -1 | 1): EditorState | null {
  const { text, cursor } = state;
  const start = lineStart(text, cursor);
  const column = cursor - start;
  if (direction === -1) {
    if (start === 0) return null;
    const previousStart = lineStart(text, start - 1);
    return { text, cursor: Math.min(previousStart + column, start - 1) };
  }
  const end = lineEnd(text, cursor);
  if (end === text.length) return null;
  const nextStart = end + 1;
  return { text, cursor: Math.min(nextStart + column, lineEnd(text, nextStart)) };
}

export interface VisualLine {
  readonly text: string;
  /** Offset of the first character in the draft. */
  readonly start: number;
}

// ponytail: wraps by UTF-16 units, so wide (CJK, emoji) characters can overflow a row.
export function wrapLines(text: string, width: number): ReadonlyArray<VisualLine> {
  const columns = Math.max(1, width);
  const lines: VisualLine[] = [];
  let start = 0;
  for (const line of text.split("\n")) {
    let offset = 0;
    do {
      lines.push({ text: line.slice(offset, offset + columns), start: start + offset });
      offset += columns;
    } while (offset < line.length);
    start += line.length + 1;
  }
  return lines;
}

/** Index of the visual line that holds the cursor. */
export function cursorLine(lines: ReadonlyArray<VisualLine>, cursor: number): number {
  for (let index = lines.length - 1; index >= 0; index--) {
    if (lines[index]!.start <= cursor) return index;
  }
  return 0;
}
