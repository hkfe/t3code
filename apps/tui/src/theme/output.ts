import stringWidth from "string-width";

// Same cell width as the glyph, so Ink's layout still holds after folding.
const ASCII: Record<string, string> = {
  "─": "-", "━": "-", "═": "-", "│": "|", "┃": "|", "║": "|", "▏": "|", "▕": "|",
  "╭": "+", "╮": "+", "╰": "+", "╯": "+", "┌": "+", "┐": "+", "└": "+", "┘": "+",
  "├": "+", "┤": "+", "┬": "+", "┴": "+", "┼": "+",
  "●": "*", "•": "*", "◆": "*", "✦": "*", "○": "o", "◇": "o",
  "▸": ">", "▶": ">", "›": ">", "→": ">", "↳": ">", "▌": ">", "▾": "v", "↓": "v",
  "‹": "<", "←": "<", "↑": "^", "▍": "_", "✓": "+", "✔": "+", "✗": "x", "✘": "x", "✕": "x",
  "·": "-", "…": "~", " ": " ",
}; // prettier-ignore

/** Non-ASCII text to ASCII of the same cell width; escape sequences are ASCII and pass. */
export function foldAscii(text: string): string {
  return text.replace(/[^\u0000-\u007f]/gu, (char) => ASCII[char] ?? "?".repeat(stringWidth(char)));
}

const KEEP = new Set([0, 1, 2, 3, 4, 7, 9, 22, 23, 24, 27, 29]);

/** NO_COLOR: drops color codes but shows a background (the selection) as reverse video. */
export function stripColor(text: string): string {
  return text.replace(/\u001b\[([0-9;]*)m/g, (_, params: string) => {
    const codes = params === "" ? [0] : params.split(";").map(Number);
    const out: number[] = [];
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]!;
      // 38/48 take "5;n" or "2;r;g;b".
      if (code === 38 || code === 48) i += codes[i + 1] === 5 ? 2 : 4;
      if (code === 48 || (code >= 40 && code <= 47) || (code >= 100 && code <= 107)) out.push(7);
      else if (code === 49) out.push(27);
      else if (KEEP.has(code)) out.push(code);
    }
    return out.length === 0 ? "" : `\u001b[${out.join(";")}m`;
  });
}

/** stdout for Ink, with the output folded for terminals without unicode or color. */
export function themedStdout(
  stdout: NodeJS.WriteStream,
  options: { readonly unicode: boolean; readonly color: boolean },
): NodeJS.WriteStream {
  if (options.unicode && options.color) return stdout;
  const fold = (text: string) => {
    const folded = options.unicode ? text : foldAscii(text);
    return options.color ? folded : stripColor(folded);
  };
  return new Proxy(stdout, {
    get(target, key) {
      if (key === "write") {
        return (chunk: unknown, ...rest: never[]) =>
          target.write(typeof chunk === "string" ? fold(chunk) : (chunk as Uint8Array), ...rest);
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
