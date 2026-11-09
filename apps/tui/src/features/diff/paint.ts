import { theme } from "../../theme/theme.ts";
import { highlight } from "../thread-view/highlight.ts";
import { merge, type Line, type Span } from "../thread-view/lines.ts";
import type { Side } from "./rows.ts";

const LANGUAGE: Record<string, string> = { md: "text", markdown: "text", txt: "text", json: "js" };

export function languageOf(path: string): string {
  const name = path.split("/").at(-1) ?? "";
  if (/^(?:Dockerfile|Makefile)$/.test(name)) return name.toLowerCase();
  const extension = name.includes(".") ? (name.split(".").at(-1) ?? "").toLowerCase() : "";
  return LANGUAGE[extension] ?? extension;
}

const CACHE_LIMIT = 4000;

/** Syntax spans per line text, cached: scrolling repaints the same lines many times. */
export function createHighlighter(language: string) {
  const cache = new Map<string, Line>();
  return (text: string): Line => {
    let line = cache.get(text);
    if (line === undefined) {
      // ponytail: per-line highlighting misses block comments and strings across lines.
      line = highlight(text, language)[0] ?? [];
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(text, line);
    }
    return line;
  };
}

const BACKGROUND = {
  add: [theme.diff.addedBg, theme.diff.addedWordBg],
  del: [theme.diff.removedBg, theme.diff.removedWordBg],
  context: [undefined, undefined],
  empty: [undefined, undefined],
} as const;

/**
 * The code cells of one side: syntax colors of `[from, to)`, the line background, a stronger one on
 * the changed range, padded or cut to `width` cells. Assumes one cell per character.
 */
export function paintSide(syntax: Line, side: Side, width: number): Line {
  const [base, word] = BACKGROUND[side.kind];
  const to = Math.min(side.to, side.from + width);
  const out: Span[] = [];
  let offset = 0;
  for (const part of syntax) {
    const start = offset;
    offset += part.text.length;
    const cuts = [start, offset, side.from, to, ...(side.mark ?? [])]
      .filter((cut) => cut >= Math.max(start, side.from) && cut <= Math.min(offset, to))
      .toSorted((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const [a, b] = [cuts[i]!, cuts[i + 1]!];
      if (a === b) continue;
      const marked = side.mark !== null && a >= side.mark[0] && b <= side.mark[1];
      const backgroundColor = marked ? word : base;
      out.push({
        ...part,
        text: part.text.slice(a - start, b - start),
        ...(backgroundColor === undefined ? {} : { backgroundColor }),
      });
    }
  }
  const pad = width - (to - side.from);
  if (pad > 0)
    out.push(
      base === undefined
        ? { text: " ".repeat(pad) }
        : { text: " ".repeat(pad), backgroundColor: base },
    );
  return merge(out);
}
