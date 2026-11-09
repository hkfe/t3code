import { theme } from "../../theme/theme.ts";
import { span, type Line, type Span, type Style } from "../thread-view/lines.ts";

// Terminal colors 0-7 (and their bright 8-15 twins) on theme tokens.
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

// CSI (SGR and the rest), OSC (titles, links) and two-byte escapes.
const ESCAPE = /\x1b\[([0-?]*)([ -/]*)([@-~])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[@-_]?/gu;
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/gu;

function applySgr(style: Style, params: string): Style {
  const codes = params === "" ? [0] : params.split(";").map(Number);
  let next: Style = style;
  for (let index = 0; index < codes.length; index++) {
    const code = codes[index]!;
    if (code === 0) next = {};
    else if (code === 1) next = { ...next, bold: true };
    else if (code === 22) next = { ...next, bold: false };
    else if (code === 3) next = { ...next, italic: true };
    else if (code === 23) next = { ...next, italic: false };
    else if (code === 4) next = { ...next, underline: true };
    else if (code === 24) next = { ...next, underline: false };
    else if (code >= 30 && code <= 37) next = { ...next, color: PALETTE[code - 30]! };
    else if (code >= 90 && code <= 97) next = { ...next, color: PALETTE[code - 90]! };
    else if (code === 39) {
      const { color: _color, ...rest } = next;
      next = rest;
    } else if (code === 38 || code === 48) {
      // 256-color and RGB stay off: only theme colors reach the screen.
      index += codes[index + 1] === 5 ? 2 : codes[index + 1] === 2 ? 4 : 1;
    }
    // Backgrounds and other attributes are ignored.
  }
  return next;
}

/**
 * Turns a CI log into styled lines. SGR colors map onto the theme; every other escape and
 * control character is dropped, so a log cannot move the cursor or retitle the terminal.
 */
export function parseAnsiLog(text: string): Line[] {
  let style: Style = {};
  return text.split(/\r?\n/u).map((raw) => {
    const spans: Span[] = [];
    const lineStyle: Style = raw.includes("##[error]")
      ? { color: theme.danger }
      : raw.includes("##[warning]")
        ? { color: theme.warning }
        : {};
    const push = (chunk: string) => {
      const clean = chunk.replaceAll("\t", "  ").replace(CONTROL, "");
      if (clean !== "") spans.push(span(clean, { ...lineStyle, ...style }));
    };
    let last = 0;
    for (const match of raw.matchAll(ESCAPE)) {
      push(raw.slice(last, match.index));
      last = match.index + match[0].length;
      if (match[3] === "m" && match[2] === "") style = applySgr(style, match[1] ?? "");
    }
    push(raw.slice(last));
    return spans;
  });
}
