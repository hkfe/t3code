import { theme } from "../../theme/theme.ts";
import { merge, type Line, type Span } from "./lines.ts";

// ponytail: one regex tokenizer for every language (keywords are a union set), so a word can
// light up in a language that does not reserve it. Swap in @pierre/highlights if that matters.
const KEYWORDS = new Set(
  (
    "abstract as async await break case catch class const continue def defer del do elif else " +
    "enum export extends final finally fn for from func function go if impl implements import in " +
    "instanceof interface is let loop match mod module mut namespace new not or and package pass " +
    "private protected pub public raise readonly return satisfies static struct super switch " +
    "throw throws trait try type typeof unsafe use var void where while with yield lambda " +
    "local then end elseif until fi esac done echo export select from where insert update " +
    "delete create table into values join on group by order limit"
  ).split(" "),
);
const LITERALS = new Set(["true", "false", "null", "undefined", "nil", "None", "True", "False"]);
const SELF = new Set(["this", "self", "Self", "super", "console", "process", "window"]);

const HASH = new Set(
  "python py sh bash zsh fish shell shellscript console yaml yml toml ruby rb r perl dockerfile makefile make ini conf nix elixir ex".split(
    " ",
  ),
);
const DASH = new Set("sql lua haskell hs".split(" "));
const MARKUP = new Set("html xml svg vue svelte jsx tsx".split(" "));
const PLAIN = new Set(["", "text", "txt", "plain", "plaintext", "log", "output"]);

function tokenizer(lang: string): RegExp {
  const comment = HASH.has(lang)
    ? String.raw`#.*`
    : DASH.has(lang)
      ? String.raw`--.*`
      : String.raw`\/\*[\s\S]*?(?:\*\/|$)|\/\/.*`;
  const tag = MARKUP.has(lang)
    ? String.raw`|(?<comment2><!--[\s\S]*?(?:-->|$))|(?<tagOpen><\/?)(?<tag>[A-Za-z][\w.:-]*)`
    : "";
  return new RegExp(
    String.raw`(?<comment>${comment})|(?<string>"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|\`(?:\\.|[^\`\\])*\`?)` +
      String.raw`|(?<number>\b(?:0x[\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)n?\b)` +
      String.raw`|(?<word>\$?[A-Za-z_][\w$]*)(?=(?<call>\s*\()?)` +
      tag +
      String.raw`|(?<op>[+\-*/%=!<>&|^~?:]+)|(?<punct>[{}()[\];,.@])`,
    "g",
  );
}

function wordColor(word: string, isCall: boolean): string {
  if (KEYWORDS.has(word)) return theme.syntax.keywords;
  if (LITERALS.has(word)) return theme.syntax.numbersBooleans;
  if (SELF.has(word)) return theme.syntax.thisBuiltinsNamespaces;
  if (isCall) return theme.syntax.functions;
  if (/^[A-Z][A-Z0-9_]+$/.test(word)) return theme.syntax.constants;
  if (/^[A-Z]/.test(word)) return theme.syntax.typesComponents;
  return theme.syntax.variablesProperties;
}

function diffLine(text: string): Span {
  const color = text.startsWith("+")
    ? theme.success
    : text.startsWith("-")
      ? theme.danger
      : text.startsWith("@@")
        ? theme.info
        : theme.text;
  return { text, color };
}

/** Highlights a fenced code block; returns one unwrapped line per source line. */
export function highlight(code: string, language: string | null | undefined): Line[] {
  const lang = (language ?? "").toLowerCase();
  const body = code.replace(/\n$/, "");
  const sourceLines = body.split("\n");
  if (lang === "diff" || lang === "patch") return sourceLines.map((text) => [diffLine(text)]);
  if (PLAIN.has(lang)) return sourceLines.map((text) => [{ text, color: theme.text }]);

  const spans: Span[] = [];
  const push = (text: string, color: string, italic = false) =>
    spans.push(italic ? { text, color, italic } : { text, color });
  const pattern = tokenizer(lang);
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    if (match.index > last) push(body.slice(last, match.index), theme.syntax.variablesProperties);
    const { comment, comment2, string, number, word, call, tagOpen, tag, op, punct } =
      match.groups ?? {};
    if (comment !== undefined || comment2 !== undefined)
      push(match[0], theme.syntax.comments, true);
    else if (string !== undefined) push(string, theme.syntax.strings);
    else if (number !== undefined) push(number, theme.syntax.numbersBooleans);
    else if (word !== undefined) push(word, wordColor(word, call !== undefined));
    else if (tagOpen !== undefined && tag !== undefined) {
      push(tagOpen, theme.syntax.punctuation);
      push(tag, theme.syntax.tags);
    } else if (op !== undefined) push(op, theme.syntax.operators);
    else if (punct !== undefined) push(punct, theme.syntax.punctuation);
    last = match.index + match[0].length;
  }
  if (last < body.length) push(body.slice(last), theme.syntax.variablesProperties);

  const lines: Span[][] = [[]];
  for (const part of spans) {
    for (const [index, text] of part.text.split("\n").entries()) {
      if (index > 0) lines.push([]);
      if (text !== "") lines.at(-1)!.push({ ...part, text });
    }
  }
  return lines.map(merge);
}
