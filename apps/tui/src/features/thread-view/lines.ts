import stringWidth from "string-width";

import { sanitizeTerminalText } from "../../app/text.tsx";

export interface Style {
  readonly color?: string;
  readonly backgroundColor?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
}

export interface Span extends Style {
  readonly text: string;
}

export type Line = ReadonlyArray<Span>;

export function span(text: string, style: Style = {}): Span {
  return { ...style, text: sanitizeTerminalText(text) };
}

export function lineWidth(line: Line): number {
  let width = 0;
  for (const part of line) width += stringWidth(part.text);
  return width;
}

/** string-width counts a tab as 0 cells, but the terminal jumps to a tab stop: use 2 spaces, as diffs do. */
const cells = (text: string) => text.replaceAll("\t", "  ");

/** Cuts `text` into pieces of at most `width` cells. */
function chop(text: string, width: number): string[] {
  const pieces: string[] = [];
  let piece = "";
  let used = 0;
  for (const char of text) {
    const w = stringWidth(char);
    if (used + w > width && piece !== "") {
      pieces.push(piece);
      piece = "";
      used = 0;
    }
    piece += char;
    used += w;
  }
  if (piece !== "") pieces.push(piece);
  return pieces;
}

/**
 * Word-wraps styled spans to `width` cells. `prefix` starts the first line and `indent` every
 * later one (list bullets, quote bars). Words wider than the line are split.
 */
export function wrap(
  spans: ReadonlyArray<Span>,
  width: number,
  prefix: Line = [],
  indent: Line = prefix,
): Line[] {
  const lines: Line[] = [];
  let current: Span[] = [...prefix];
  let used = lineWidth(prefix);
  let lineStart = true;
  // A space waits until the next word fits, so lines never end in one.
  let space: Span | null = null;
  const room = () => Math.max(1, width - lineWidth(lines.length === 0 ? prefix : indent));
  const newLine = () => {
    lines.push(current);
    current = [...indent];
    used = lineWidth(indent);
    lineStart = true;
    space = null;
  };

  for (const part of spans) {
    for (const [index, segment] of cells(part.text).split("\n").entries()) {
      if (index > 0) newLine();
      for (const word of segment.split(/(\s+)/)) {
        if (word === "") continue;
        if (/^\s+$/.test(word)) {
          if (!lineStart) space = { ...part, text: word };
          continue;
        }
        const w = stringWidth(word);
        const gap = space ? stringWidth(space.text) : 0;
        if (!lineStart && used + gap + w > width) newLine();
        else if (space) {
          current.push(space);
          used += gap;
          space = null;
        }
        if (w > room()) {
          for (const piece of chop(word, room())) {
            if (!lineStart) newLine();
            current.push({ ...part, text: piece });
            used += stringWidth(piece);
            lineStart = false;
          }
          continue;
        }
        current.push({ ...part, text: word });
        used += w;
        lineStart = false;
      }
    }
  }
  lines.push(current);
  return lines.map(merge);
}

/** Hard-wraps one preformatted line (code) without breaking at spaces. */
export function wrapHard(spans: ReadonlyArray<Span>, width: number, indent: Line = []): Line[] {
  const room = Math.max(1, width - lineWidth(indent));
  const lines: Span[][] = [[...indent]];
  let used = 0;
  for (const part of spans) {
    for (const char of cells(part.text)) {
      const w = stringWidth(char);
      if (used + w > room) {
        lines.push([...indent]);
        used = 0;
      }
      lines.at(-1)!.push({ ...part, text: char });
      used += w;
    }
  }
  return lines.map(merge);
}

/** Joins neighbouring spans with the same style, so Ink renders fewer nodes. */
export function merge(line: Line): Line {
  const out: Span[] = [];
  for (const part of line) {
    const last = out.at(-1);
    if (
      last &&
      last.color === part.color &&
      last.backgroundColor === part.backgroundColor &&
      last.bold === part.bold &&
      last.italic === part.italic &&
      last.underline === part.underline &&
      last.strikethrough === part.strikethrough
    ) {
      out[out.length - 1] = { ...last, text: last.text + part.text };
    } else out.push(part);
  }
  return out;
}

export function truncate(text: string, width: number): string {
  if (stringWidth(text) <= width) return text;
  return `${chop(text, Math.max(1, width - 1))[0] ?? ""}…`;
}
